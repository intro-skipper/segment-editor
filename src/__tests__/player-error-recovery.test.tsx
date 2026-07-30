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
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BaseItemDto } from '@/types/jellyfin'
import type { VideoPlayerError } from '@/hooks/use-video-player'
import { useVideoPlayer } from '@/hooks/use-video-player'
import { getPlaybackConfig } from '@/services/video/api'
import type * as VideoApiModule from '@/services/video/api'

type Listener = (event: string, data: unknown) => void

interface FakeHlsInstance {
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

const observed: {
  error: VideoPlayerError | null
  isRecovering: boolean
  retry: () => void
} = {
  error: null,
  isRecovering: false,
  retry: () => {},
}

/** Exposes the hook state Player.tsx renders the overlays from. */
function Harness({ item }: { item: BaseItemDto }) {
  const { error, isRecovering, retry, videoRef } = useVideoPlayer({
    item,
    t: (key: string) => key,
  })

  useEffect(() => {
    observed.error = error
    observed.isRecovering = isRecovering
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
  return Boolean(observed.error && !observed.isRecovering)
}

function emitHlsEvent(hls: FakeHlsInstance, event: string, data?: unknown) {
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
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('clears the error state as soon as a fragment buffers after recovery', async () => {
    const { hls } = await renderPlayingHarness()

    emitHlsEvent(hls, 'hlsError', fatalMediaError)
    expect(observed.error).not.toBeNull()
    expect(observed.isRecovering).toBe(true)
    expect(hls.recoverCalls).toBe(1)

    // Playback resumes: a fragment appends successfully well before the
    // fallback recovery timer would have fired.
    emitHlsEvent(hls, 'hlsFragBuffered')

    expect(observed.error).toBeNull()
    expect(observed.isRecovering).toBe(false)
    expect(errorOverlayVisible()).toBe(false)
  })

  it('falls back to the recovery timer when no fragment buffers', async () => {
    const { hls } = await renderPlayingHarness()
    vi.useFakeTimers()

    emitHlsEvent(hls, 'hlsError', fatalMediaError)
    expect(observed.isRecovering).toBe(true)

    act(() => {
      vi.advanceTimersByTime(2100)
    })

    expect(observed.error).toBeNull()
    expect(observed.isRecovering).toBe(false)
  })

  it('keeps unknown fatal errors recoverable and rebuilds the player on retry', async () => {
    const { hls, utils } = await renderPlayingHarness()

    emitHlsEvent(hls, 'hlsError', fatalOtherError)
    expect(errorOverlayVisible()).toBe(true)
    expect(observed.error?.recoverable).toBe(true)

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
    expect(observed.error).toBeNull()
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

    emitHlsEvent(hls, 'hlsError', fatalOtherError)
    expect(errorOverlayVisible()).toBe(true)

    emitHlsEvent(hls, 'hlsFragBuffered')

    expect(errorOverlayVisible()).toBe(false)
    expect(observed.error).toBeNull()
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
})
