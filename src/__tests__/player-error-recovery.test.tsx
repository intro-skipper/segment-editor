// @vitest-environment jsdom
/**
 * Regression tests for the HLS error-recovery overlay lifecycle
 * (intro-skipper/segment-editor-plugin#7: error overlay never disappeared
 * after playback recovered).
 *
 * Wires useVideoPlayer (with the real useHlsPlayer) to the real playerReducer
 * exactly like Player.tsx does, and drives hls.js events through a fake.
 */

import { act, render, waitFor } from '@testing-library/react'
import { useEffect, useReducer } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BaseItemDto } from '@/types/jellyfin'
import type {
  VideoPlayerError,
  VideoPlayerErrorType,
} from '@/hooks/use-video-player'
import type { HlsPlayerError } from '@/hooks/use-hls-player'
import { useVideoPlayer } from '@/hooks/use-video-player'
import {
  initialPlayerState,
  playerReducer,
} from '@/components/player/player-reducer'
import type { PlayerState } from '@/components/player/player-reducer'
import { getPlaybackConfig } from '@/services/video/api'

type Listener = (event: string, data: unknown) => void

interface FakeHlsInstance {
  listeners: Map<string, Set<Listener>>
  destroyed: boolean
  loadedUrls: Array<string>
  recoverCalls: number
  swapAudioCodecCalls: number
  config: Record<string, unknown>
  emit: (event: string, data?: unknown) => void
}

const hlsState = vi.hoisted(() => ({
  instances: [] as Array<FakeHlsInstance>,
}))

vi.mock('hls.js', () => {
  class FakeHls implements FakeHlsInstance {
    static Events = {
      ERROR: 'hlsError',
      MANIFEST_PARSED: 'hlsManifestParsed',
      FRAG_BUFFERED: 'hlsFragBuffered',
    }
    static ErrorTypes = {
      NETWORK_ERROR: 'networkError',
      MEDIA_ERROR: 'mediaError',
      OTHER_ERROR: 'otherError',
    }
    static isSupported = () => true

    listeners = new Map<string, Set<Listener>>()
    destroyed = false
    loadedUrls: Array<string> = []
    recoverCalls = 0
    swapAudioCodecCalls = 0
    config: Record<string, unknown>

    constructor(config: Record<string, unknown>) {
      this.config = config
      hlsState.instances.push(this)
    }
    attachMedia() {}
    loadSource(url: string) {
      this.loadedUrls.push(url)
    }
    on(event: string, listener: Listener) {
      if (!this.listeners.has(event)) this.listeners.set(event, new Set())
      this.listeners.get(event)!.add(listener)
    }
    off(event: string, listener: Listener) {
      this.listeners.get(event)?.delete(listener)
    }
    destroy() {
      this.destroyed = true
      this.listeners.clear()
    }
    recoverMediaError() {
      this.recoverCalls++
    }
    swapAudioCodec() {
      this.swapAudioCodecCalls++
    }
    startLoad() {}
    emit(event: string, data: unknown = {}) {
      for (const listener of [...(this.listeners.get(event) ?? [])]) {
        listener(event, data)
      }
    }
  }
  return { default: FakeHls }
})

vi.mock('@/services/video/api', () => ({
  getPlaybackConfig: vi.fn(),
  getPlaybackMediaSourceId: (item: BaseItemDto) =>
    item.MediaSources?.[0]?.Id ?? item.Id?.replace(/-/g, ''),
}))

vi.mock('@/services/video/playback-session', () => ({
  reportPlaybackProgress: vi.fn().mockResolvedValue(undefined),
  startPlaybackStatus: vi.fn().mockResolvedValue(undefined),
  stopPlaybackStatus: vi.fn().mockResolvedValue(undefined),
  stopPlaybackStatusKeepalive: vi.fn(),
}))

vi.mock('@/services/video/session', () => ({
  createPlaySessionId: vi.fn(() => 'session-1'),
}))

vi.mock('@/services/video/transcode-session', () => ({
  stopActiveEncoding: vi.fn().mockResolvedValue(undefined),
  stopActiveEncodingKeepalive: vi.fn(),
}))

function mapVideoErrorType(type: VideoPlayerErrorType): HlsPlayerError['type'] {
  switch (type) {
    case 'media_error':
      return 'media'
    case 'network_error':
      return 'network'
    default:
      return 'unknown'
  }
}

const observed: { state: PlayerState; retry: () => void } = {
  state: initialPlayerState,
  retry: () => {},
}

/** Replicates the error/recovery wiring between Player.tsx and useVideoPlayer. */
function Harness({ item }: { item: BaseItemDto }) {
  const [state, dispatch] = useReducer(playerReducer, initialPlayerState)

  const handleVideoError = (error: VideoPlayerError | null) => {
    if (error) {
      const hlsError: HlsPlayerError = {
        type: mapVideoErrorType(error.type),
        message: error.message,
        recoverable: error.recoverable,
      }
      dispatch({ type: 'ERROR_STATE', error: hlsError, isRecovering: false })
    } else {
      dispatch({ type: 'ERROR_STATE', error: null, isRecovering: false })
    }
  }

  const player = useVideoPlayer({
    item,
    onError: handleVideoError,
    onStrategyChange: () => {
      dispatch({ type: 'ERROR_STATE', error: null, isRecovering: false })
    },
    onRecoveryStart: () => {
      dispatch({ type: 'RECOVERY_START' })
    },
    onRecoveryEnd: () => {
      dispatch({ type: 'RECOVERY_END' })
    },
    t: (key: string) => key,
  })
  const { retry, videoRef } = player

  useEffect(() => {
    observed.state = state
    observed.retry = retry
  })

  return (
    <video ref={videoRef} muted>
      <track kind="captions" />
    </video>
  )
}

/** Mirrors PlayerSurface's overlay conditions. */
function errorOverlayVisible() {
  return Boolean(observed.state.playerError && !observed.state.isRecovering)
}

const HLS_URL = 'https://jellyfin.example/Videos/item-1/master.m3u8'

async function renderPlayingHarness() {
  vi.mocked(getPlaybackConfig).mockResolvedValue({
    strategy: 'hls',
    url: HLS_URL,
  })
  const utils = render(
    <Harness
      item={{
        Id: 'item-1',
        Name: 'MP2 Movie',
        Type: 'Movie',
        MediaSources: [{ Id: 'media-source-1' }],
      }}
    />,
  )
  await waitFor(() => {
    expect(hlsState.instances.at(-1)?.loadedUrls).toContain(HLS_URL)
  })
  const hls = hlsState.instances.at(-1)!
  act(() => {
    hls.emit('hlsManifestParsed')
  })
  return { utils, hls }
}

const fatalMediaError = {
  type: 'mediaError',
  details: 'bufferAppendError',
  fatal: true,
}
const fatalOtherError = { type: 'otherError', details: 'muxError', fatal: true }

describe('HLS error recovery overlay lifecycle', () => {
  beforeEach(() => {
    hlsState.instances.length = 0
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('clears the error state as soon as a fragment buffers after recovery', async () => {
    const { hls } = await renderPlayingHarness()
    vi.useFakeTimers()

    act(() => {
      hls.emit('hlsError', fatalMediaError)
    })
    expect(observed.state.playerError).not.toBeNull()
    expect(observed.state.isRecovering).toBe(true)
    expect(hls.recoverCalls).toBe(1)

    // Playback resumes: a fragment appends successfully well before the
    // fallback recovery timer would have fired.
    act(() => {
      hls.emit('hlsFragBuffered')
    })

    expect(observed.state.playerError).toBeNull()
    expect(observed.state.isRecovering).toBe(false)
    expect(errorOverlayVisible()).toBe(false)
  })

  it('falls back to the recovery timer when no fragment buffers', async () => {
    const { hls } = await renderPlayingHarness()
    vi.useFakeTimers()

    act(() => {
      hls.emit('hlsError', fatalMediaError)
    })
    expect(observed.state.isRecovering).toBe(true)

    act(() => {
      vi.advanceTimersByTime(2100)
    })

    expect(observed.state.playerError).toBeNull()
    expect(observed.state.isRecovering).toBe(false)
  })

  it('keeps unknown fatal errors recoverable and rebuilds the player on retry', async () => {
    const { hls, utils } = await renderPlayingHarness()

    act(() => {
      hls.emit('hlsError', fatalOtherError)
    })
    expect(errorOverlayVisible()).toBe(true)
    expect(observed.state.playerError?.recoverable).toBe(true)

    const video = utils.container.querySelector('video')!
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 42,
    })

    const instancesBefore = hlsState.instances.length
    act(() => {
      observed.retry()
    })

    // The overlay clears immediately on retry...
    expect(observed.state.playerError).toBeNull()
    expect(errorOverlayVisible()).toBe(false)

    // ...and a fresh Hls instance reloads the source from the same position.
    await waitFor(() => {
      expect(hlsState.instances.length).toBe(instancesBefore + 1)
      expect(hlsState.instances.at(-1)?.loadedUrls).toContain(HLS_URL)
    })
    expect(hls.destroyed).toBe(true)
    expect(hlsState.instances.at(-1)?.config.startPosition).toBe(42)
  })

  it('clears a stuck unknown error once fragments buffer again', async () => {
    const { hls } = await renderPlayingHarness()

    act(() => {
      hls.emit('hlsError', fatalOtherError)
    })
    expect(errorOverlayVisible()).toBe(true)

    act(() => {
      hls.emit('hlsFragBuffered')
    })

    expect(errorOverlayVisible()).toBe(false)
    expect(observed.state.playerError).toBeNull()
  })

  it('swaps the audio codec when media errors repeat within the swap window', async () => {
    const { hls } = await renderPlayingHarness()

    act(() => {
      hls.emit('hlsError', fatalMediaError)
    })
    expect(hls.swapAudioCodecCalls).toBe(0)
    expect(hls.recoverCalls).toBe(1)

    act(() => {
      hls.emit('hlsError', fatalMediaError)
    })
    expect(hls.swapAudioCodecCalls).toBe(1)
    expect(hls.recoverCalls).toBe(2)
  })

  it('does not swap the audio codec for a new media error after a successful recovery', async () => {
    const { hls } = await renderPlayingHarness()

    act(() => {
      hls.emit('hlsError', fatalMediaError)
    })
    expect(hls.recoverCalls).toBe(1)

    // Playback genuinely recovers: the swap window must reset so the next
    // independent media error does not needlessly swap a working audio track.
    act(() => {
      hls.emit('hlsFragBuffered')
    })

    act(() => {
      hls.emit('hlsError', fatalMediaError)
    })
    expect(hls.swapAudioCodecCalls).toBe(0)
    expect(hls.recoverCalls).toBe(2)
  })
})
