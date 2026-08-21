// @vitest-environment jsdom
/**
 * Regression tests for the HLS error-recovery overlay lifecycle
 * (intro-skipper/segment-editor-plugin#7: error overlay never disappeared
 * after playback recovered).
 *
 * useVideoPlayer (with the real useHlsPlayer) owns the error/recovery state
 * the overlay renders from; these tests observe the hook's returned state
 * directly and drive hls.js events through a fake.
 */

import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'

import type { BaseItemDto } from '@/types/jellyfin'
import { useVideoPlayer } from '@/hooks/use-video-player'
import { getPlaybackConfig } from '@/services/video/api'
import type * as VideoApiModule from '@/services/video/api'

/** The event payloads this fake emits: an hls.js error, or nothing. */
interface HlsEventData {
  type?: string
  details?: string
  fatal?: boolean
}

/** The hls.js config fields this suite asserts on. */
interface FakeHlsConfig {
  startPosition?: number
}

type Listener = (event: string, data: HlsEventData) => void

interface FakeHlsInstance {
  destroyed: boolean
  loadedUrls: Array<string>
  recoverCalls: number
  swapAudioCodecCalls: number
  config: FakeHlsConfig
  emit: (event: string, data?: HlsEventData) => void
}

const hlsState = vi.hoisted(() => {
  const instances: Array<FakeHlsInstance> = []
  return { instances }
})

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
    }
    static isSupported = () => true

    listeners = new Map<string, Set<Listener>>()
    destroyed = false
    loadedUrls: Array<string> = []
    recoverCalls = 0
    swapAudioCodecCalls = 0
    config: FakeHlsConfig

    constructor(config: FakeHlsConfig) {
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
    emit(event: string, data: HlsEventData = {}) {
      for (const listener of [...(this.listeners.get(event) ?? [])]) {
        listener(event, data)
      }
    }
  }
  return { default: FakeHls }
})

vi.mock('@/services/video/api', async (importOriginal) => ({
  // Keep the real getPlaybackMediaSourceId so the test cannot drift from the
  // production fallback logic.
  ...(await importOriginal<typeof VideoApiModule>()),
  getPlaybackConfig: vi.fn(),
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

/** The hook state Player.tsx renders the overlays from, as of the last commit. */
let latest: ReturnType<typeof useVideoPlayer> | undefined

/** The hook result from the most recent committed render. */
function latestPlayer(): ReturnType<typeof useVideoPlayer> {
  if (!latest) throw new Error('Harness has not committed a render')
  return latest
}

function Harness({ item }: { item: BaseItemDto }) {
  const player = useVideoPlayer({
    item,
    t: (key: string) => key,
  })
  // Destructured to a binding before JSX: React Compiler's ref-in-render
  // validation rejects the inline `player.videoRef` member read, but accepts
  // a destructured ref passed as a ref prop - the same shape Player.tsx uses.
  const { videoRef } = player

  // Publish after commit, not during render: render must stay pure, and the
  // overlays these tests assert on are the ones the committed UI shows.
  useEffect(() => {
    latest = player
  })

  return (
    <video ref={videoRef} muted>
      <track kind="captions" />
    </video>
  )
}

function emitHlsEvent(
  hls: FakeHlsInstance,
  event: string,
  data?: HlsEventData,
) {
  act(() => {
    hls.emit(event, data)
  })
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
  emitHlsEvent(hls, 'hlsManifestParsed')
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
    // Only assigned once a render commits, so clear it: a harness that never
    // commits must fail in `latestPlayer`, not assert against the previous
    // test's (unmounted) player. Also drops its video element for the GC.
    latest = undefined
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('clears the error state as soon as a fragment buffers after recovery', async () => {
    const { hls } = await renderPlayingHarness()

    emitHlsEvent(hls, 'hlsError', fatalMediaError)
    expect(latestPlayer().error?.type).toBe('media_error')
    expect(latestPlayer().isRecovering).toBe(true)
    expect(hls.recoverCalls).toBe(1)

    // Playback resumes: a fragment appends successfully well before the
    // fallback recovery timer would have fired.
    emitHlsEvent(hls, 'hlsFragBuffered')

    expect(latestPlayer().error).toBeNull()
    expect(latestPlayer().isRecovering).toBe(false)
  })

  it('falls back to the recovery timer when no fragment buffers', async () => {
    const { hls } = await renderPlayingHarness()
    vi.useFakeTimers()

    emitHlsEvent(hls, 'hlsError', fatalMediaError)
    expect(latestPlayer().isRecovering).toBe(true)

    act(() => {
      vi.advanceTimersByTime(2100)
    })

    expect(latestPlayer().error).toBeNull()
    expect(latestPlayer().isRecovering).toBe(false)
  })

  it('keeps unknown fatal errors recoverable and rebuilds the player on retry', async () => {
    const { hls, utils } = await renderPlayingHarness()

    emitHlsEvent(hls, 'hlsError', fatalOtherError)
    expect(latestPlayer().error?.type).toBe('unknown_error')
    expect(latestPlayer().isRecovering).toBe(false)
    expect(latestPlayer().error?.recoverable).toBe(true)

    const video = utils.container.querySelector('video')!
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      value: 42,
    })

    const instancesBefore = hlsState.instances.length
    act(() => {
      latestPlayer().retry()
    })

    // The overlay clears immediately on retry...
    expect(latestPlayer().error).toBeNull()

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

    emitHlsEvent(hls, 'hlsError', fatalOtherError)
    expect(latestPlayer().error).not.toBeNull()

    emitHlsEvent(hls, 'hlsFragBuffered')

    expect(latestPlayer().error).toBeNull()
    expect(latestPlayer().isRecovering).toBe(false)
  })

  it('swaps the audio codec when media errors repeat within the swap window', async () => {
    const { hls } = await renderPlayingHarness()

    emitHlsEvent(hls, 'hlsError', fatalMediaError)
    expect(hls.swapAudioCodecCalls).toBe(0)
    expect(hls.recoverCalls).toBe(1)

    emitHlsEvent(hls, 'hlsError', fatalMediaError)
    expect(hls.swapAudioCodecCalls).toBe(1)
    expect(hls.recoverCalls).toBe(2)
  })

  it('does not swap the audio codec for a new media error after a successful recovery', async () => {
    const { hls } = await renderPlayingHarness()

    emitHlsEvent(hls, 'hlsError', fatalMediaError)
    expect(hls.recoverCalls).toBe(1)

    // Playback genuinely recovers: the swap window must reset so the next
    // independent media error does not needlessly swap a working audio track.
    emitHlsEvent(hls, 'hlsFragBuffered')

    emitHlsEvent(hls, 'hlsError', fatalMediaError)
    expect(hls.swapAudioCodecCalls).toBe(0)
    expect(hls.recoverCalls).toBe(2)
  })

  it('still resets the swap window when a fragment buffers after the recovery timer expired', async () => {
    const { hls } = await renderPlayingHarness()
    vi.useFakeTimers()

    emitHlsEvent(hls, 'hlsError', fatalMediaError)

    // The blind fallback timer clears the visible error, but it is not a
    // success signal — the swap window must stay armed until playback
    // genuinely progresses.
    act(() => {
      vi.advanceTimersByTime(2100)
    })
    expect(latestPlayer().error).toBeNull()

    emitHlsEvent(hls, 'hlsFragBuffered')

    emitHlsEvent(hls, 'hlsError', fatalMediaError)
    expect(hls.swapAudioCodecCalls).toBe(0)
    expect(hls.recoverCalls).toBe(2)
  })
})
