// @vitest-environment jsdom

import {
  act,
  cleanup,
  render,
  renderHook,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'

import type { BaseItemDto } from '@/types/jellyfin'
import { useJellyfinSession } from '@/hooks/use-jellyfin-session'
import { useVideoPlayer } from '@/hooks/use-video-player'
import type { PlaybackStrategy } from '@/services/video/api'
import { getPlaybackConfig } from '@/services/video/api'
import {
  reportPlaybackProgress,
  startPlaybackStatus,
  stopPlaybackStatus,
  stopPlaybackStatusKeepalive,
} from '@/services/video/playback-session'
import { createPlaySessionId } from '@/services/video/session'
import {
  stopActiveEncoding,
  stopActiveEncodingKeepalive,
} from '@/services/video/transcode-session'

/** The ref the hook hands back, which tests populate with a real element. */
interface VideoElementRef {
  current: HTMLVideoElement | null
}

const hlsMocks = vi.hoisted(() => {
  const videoRef: VideoElementRef = { current: null }
  return { videoRef, hlsRef: { current: null }, retry: vi.fn() }
})

vi.mock('@/hooks/use-hls-player', () => ({
  useHlsPlayer: vi.fn(() => ({
    videoRef: hlsMocks.videoRef,
    hlsRef: hlsMocks.hlsRef,
    retry: hlsMocks.retry,
  })),
}))

vi.mock('@/services/video/api', () => {
  return {
    getPlaybackConfig: vi.fn(),
    getPlaybackMediaSourceId: (item: BaseItemDto) =>
      item.MediaSources?.[0]?.Id ?? item.Id?.replace(/-/g, ''),
  }
})

vi.mock('@/services/video/playback-session', () => ({
  reportPlaybackProgress: vi.fn(),
  startPlaybackStatus: vi.fn(),
  stopPlaybackStatus: vi.fn(),
  stopPlaybackStatusKeepalive: vi.fn(),
}))

vi.mock('@/services/video/session', () => ({
  createPlaySessionId: vi.fn(),
}))

vi.mock('@/services/video/transcode-session', () => ({
  stopActiveEncoding: vi.fn(),
  stopActiveEncodingKeepalive: vi.fn(),
}))

/** A promise plus the handle that settles it, for ordering async steps. */
interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function createDeferred(): Deferred<void> {
  let resolve!: (value: void) => void
  const promise = new Promise<void>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function createDeferredValue<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function createItem(id = 'item-1'): BaseItemDto {
  return {
    Id: id,
    Name: 'Test Item',
    Type: 'Movie',
    MediaSources: [{ Id: `${id}-media-source` }],
  }
}

type RenderVideoPlayerProps = {
  item: BaseItemDto
  jellyfinPlaybackSyncEnabled: boolean
  getInitialAudioStreamIndex?: () => number | undefined
  onStrategyChange?: (strategy: PlaybackStrategy) => void
}

type RenderVideoPlayerOptions = Partial<RenderVideoPlayerProps>

function renderVideoPlayer(options?: RenderVideoPlayerOptions) {
  const initialProps: RenderVideoPlayerProps = {
    item: options?.item ?? createItem(),
    jellyfinPlaybackSyncEnabled: options?.jellyfinPlaybackSyncEnabled ?? false,
  }

  if (options?.getInitialAudioStreamIndex !== undefined) {
    initialProps.getInitialAudioStreamIndex = options.getInitialAudioStreamIndex
  }

  if (options?.onStrategyChange !== undefined) {
    initialProps.onStrategyChange = options.onStrategyChange
  }

  return renderHook(
    ({
      item,
      jellyfinPlaybackSyncEnabled,
      getInitialAudioStreamIndex,
      onStrategyChange,
    }: RenderVideoPlayerProps) =>
      useVideoPlayer({
        item,
        jellyfinPlaybackSyncEnabled,
        getInitialAudioStreamIndex,
        onStrategyChange,
        t: (key) => key,
      }),
    {
      initialProps,
    },
  )
}

/**
 * Mocks a direct-play start whose error fallback is forced to HLS: the load
 * stub, the three-session id chain, and a getPlaybackConfig that embeds the
 * requested AudioStreamIndex in the forced-HLS URL.
 */
function mockDirectPlayThenForcedHlsFallback() {
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(
    () => undefined,
  )
  vi.mocked(createPlaySessionId)
    .mockReturnValueOnce('unused-initial-hls-session')
    .mockReturnValueOnce('direct-session-1')
    .mockReturnValueOnce('hls-fallback-session')
  vi.mocked(getPlaybackConfig).mockImplementation(
    async (_item, _startTimeTicks, audioStreamIndex, forceHls, sessionId) =>
      forceHls
        ? {
            strategy: 'hls' as const,
            url: `https://jellyfin.example/Videos/item-1/master.m3u8?PlaySessionId=${sessionId}&AudioStreamIndex=${audioStreamIndex}`,
          }
        : {
            strategy: 'direct' as const,
            url: 'https://jellyfin.example/Videos/item-1/stream',
          },
  )
}

/** Renders a session that initialized on audio index 2. */
function renderAudioFallbackHarness(options?: {
  getCurrentAudioStreamIndex?: () => number | undefined
}) {
  let player!: ReturnType<typeof useVideoPlayer>
  function Harness() {
    const current = useVideoPlayer({
      item: createItem(),
      getInitialAudioStreamIndex: () => 2,
      getCurrentAudioStreamIndex: options?.getCurrentAudioStreamIndex,
      t: (key) => key,
    })
    const { videoRef } = current
    // Publish after commit, not during render: reassigning the closed-over
    // variable in the render body is a side effect the compiler rejects.
    useEffect(() => {
      player = current
    })
    return (
      <video ref={videoRef}>
        <track kind="captions" label="Captions" src="data:text/vtt,WEBVTT" />
      </video>
    )
  }
  const { container } = render(<Harness />)
  return { container, getPlayer: () => player }
}

function dispatchDirectPlayError(video: HTMLVideoElement) {
  Object.defineProperty(video, 'error', {
    configurable: true,
    value: { code: MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED },
  })
  act(() => {
    video.dispatchEvent(new Event('error'))
  })
}

describe('useVideoPlayer Jellyfin playback sync', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    hlsMocks.videoRef.current = document.createElement('video')
    hlsMocks.videoRef.current.currentTime = 12
    vi.mocked(createPlaySessionId).mockReturnValue('hls-session-1')
    vi.mocked(getPlaybackConfig).mockResolvedValue({
      strategy: 'hls',
      url: 'https://jellyfin.example/Videos/item-1/master.m3u8?PlaySessionId=hls-session-1',
    })
    vi.mocked(startPlaybackStatus).mockResolvedValue(undefined)
    vi.mocked(reportPlaybackProgress).mockResolvedValue(undefined)
    vi.mocked(stopPlaybackStatus).mockResolvedValue(undefined)
    vi.mocked(stopActiveEncoding).mockResolvedValue(undefined)
  })

  it('does not report playback status when sync is disabled', async () => {
    renderVideoPlayer()

    await waitFor(() => {
      expect(getPlaybackConfig).toHaveBeenCalled()
    })

    expect(startPlaybackStatus).not.toHaveBeenCalled()
    expect(reportPlaybackProgress).not.toHaveBeenCalled()
    expect(stopPlaybackStatus).not.toHaveBeenCalled()
  })

  it('starts playback status with the active HLS play session when sync is enabled', async () => {
    renderVideoPlayer({ jellyfinPlaybackSyncEnabled: true })

    await waitFor(() => {
      expect(getPlaybackConfig).toHaveBeenCalledWith(
        expect.objectContaining({ Id: 'item-1' }),
        undefined,
        undefined,
        false,
        'hls-session-1',
      )
      expect(startPlaybackStatus).toHaveBeenCalledWith({
        itemId: 'item-1',
        mediaSourceId: 'item-1-media-source',
        playSessionId: 'hls-session-1',
        playMethod: 'Transcode',
        positionTicks: 120_000_000,
        isPaused: true,
      })
    })
  })

  it('uses a generated HLS play session when direct play falls back to HLS', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(
      () => undefined,
    )
    vi.mocked(createPlaySessionId)
      .mockReturnValueOnce('unused-initial-hls-session')
      .mockReturnValueOnce('hls-session-1')
    vi.mocked(getPlaybackConfig)
      .mockResolvedValueOnce({
        strategy: 'direct',
        url: 'https://jellyfin.example/Videos/item-1/stream',
      })
      .mockResolvedValueOnce({
        strategy: 'hls',
        url: 'https://jellyfin.example/Videos/item-1/master.m3u8?PlaySessionId=hls-session-1',
      })

    function Harness() {
      const player = useVideoPlayer({
        item: createItem(),
        t: (key) => key,
      })
      const { videoRef } = player
      return (
        <video ref={videoRef}>
          <track kind="captions" label="Captions" src="data:text/vtt,WEBVTT" />
        </video>
      )
    }

    const { container } = render(<Harness />)

    await waitFor(() => {
      expect(getPlaybackConfig).toHaveBeenCalledWith(
        expect.objectContaining({ Id: 'item-1' }),
        undefined,
        undefined,
        false,
        'unused-initial-hls-session',
      )
    })

    const video = container.querySelector('video')!
    await waitFor(() => {
      expect(video.src).toContain('/Videos/item-1/stream')
    })

    dispatchDirectPlayError(video)

    await waitFor(() => {
      expect(getPlaybackConfig).toHaveBeenCalledWith(
        expect.objectContaining({ Id: 'item-1' }),
        undefined,
        undefined,
        true,
        'hls-session-1',
      )
    })
  })
  it('preserves direct-play position when synced direct play falls back to HLS', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(
      () => undefined,
    )
    vi.mocked(createPlaySessionId)
      .mockReturnValueOnce('unused-initial-hls-session')
      .mockReturnValueOnce('direct-session-1')
      .mockReturnValueOnce('hls-session-1')
    vi.mocked(getPlaybackConfig)
      .mockResolvedValueOnce({
        strategy: 'direct',
        url: 'https://jellyfin.example/Videos/item-1/stream',
      })
      .mockResolvedValueOnce({
        strategy: 'hls',
        url: 'https://jellyfin.example/Videos/item-1/master.m3u8?PlaySessionId=hls-session-1',
      })

    function Harness() {
      const player = useVideoPlayer({
        item: createItem(),
        jellyfinPlaybackSyncEnabled: true,
        t: (key) => key,
      })
      const { videoRef } = player
      return (
        <video
          key={player.strategy}
          data-strategy={player.strategy}
          ref={videoRef}
        >
          <track kind="captions" label="Captions" src="data:text/vtt,WEBVTT" />
        </video>
      )
    }

    const { container } = render(<Harness />)

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledWith({
        itemId: 'item-1',
        mediaSourceId: 'item-1-media-source',
        playSessionId: 'direct-session-1',
        playMethod: 'DirectPlay',
        positionTicks: 0,
        isPaused: true,
      })
    })

    const directVideo = container.querySelector<HTMLVideoElement>(
      'video[data-strategy="direct"]',
    )
    expect(directVideo).not.toBeNull()
    directVideo!.currentTime = 42
    vi.mocked(startPlaybackStatus).mockClear()

    dispatchDirectPlayError(directVideo!)

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledWith({
        itemId: 'item-1',
        mediaSourceId: 'item-1-media-source',
        playSessionId: 'hls-session-1',
        playMethod: 'Transcode',
        positionTicks: 420_000_000,
        isPaused: true,
      })
    })
    expect(stopPlaybackStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item-1',
        mediaSourceId: 'item-1-media-source',
        playSessionId: 'direct-session-1',
        playMethod: 'DirectPlay',
        positionTicks: 420_000_000,
      }),
    )
  })

  it('stops stale pending playback status after sync is disabled mid-start', async () => {
    const startDeferred = createDeferred()
    vi.mocked(startPlaybackStatus).mockReturnValue(startDeferred.promise)

    const { rerender } = renderVideoPlayer({
      jellyfinPlaybackSyncEnabled: true,
    })

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledTimes(1)
    })

    hlsMocks.videoRef.current!.currentTime = 34
    rerender({ item: createItem(), jellyfinPlaybackSyncEnabled: false })

    await act(async () => {
      startDeferred.resolve()
      await startDeferred.promise
    })

    rerender({ item: createItem(), jellyfinPlaybackSyncEnabled: false })

    act(() => {
      hlsMocks.videoRef.current?.dispatchEvent(new Event('play'))
    })

    expect(reportPlaybackProgress).not.toHaveBeenCalled()
    expect(stopPlaybackStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item-1',
        mediaSourceId: 'item-1-media-source',
        playSessionId: 'hls-session-1',
        positionTicks: 340_000_000,
      }),
    )
    expect(vi.mocked(stopPlaybackStatus).mock.calls[0]?.[0]).not.toHaveProperty(
      'startId',
    )
    expect(vi.mocked(stopPlaybackStatus).mock.calls[0]?.[0]).not.toHaveProperty(
      'requestId',
    )
  })

  it('reuses a pending HLS playback status when sync is re-enabled before start resolves', async () => {
    const startDeferred = createDeferred()
    vi.mocked(startPlaybackStatus).mockReturnValue(startDeferred.promise)

    const { rerender } = renderVideoPlayer({
      jellyfinPlaybackSyncEnabled: true,
    })

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledTimes(1)
    })

    rerender({ item: createItem(), jellyfinPlaybackSyncEnabled: false })
    rerender({ item: createItem(), jellyfinPlaybackSyncEnabled: true })

    expect(startPlaybackStatus).toHaveBeenCalledTimes(1)

    await act(async () => {
      startDeferred.resolve()
      await startDeferred.promise
    })

    expect(stopPlaybackStatus).not.toHaveBeenCalled()

    act(() => {
      hlsMocks.videoRef.current?.dispatchEvent(new Event('playing'))
    })

    await waitFor(() => {
      expect(reportPlaybackProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          playSessionId: 'hls-session-1',
          playMethod: 'Transcode',
        }),
      )
    })
    expect(
      vi.mocked(reportPlaybackProgress).mock.calls[0]?.[0],
    ).not.toHaveProperty('startId')
    expect(
      vi.mocked(reportPlaybackProgress).mock.calls[0]?.[0],
    ).not.toHaveProperty('requestId')
  })

  it('starts playback status immediately when sync is toggled on after HLS loads', async () => {
    const { rerender } = renderVideoPlayer()

    await waitFor(() => {
      expect(getPlaybackConfig).toHaveBeenCalled()
    })

    rerender({ item: createItem(), jellyfinPlaybackSyncEnabled: true })

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledTimes(1)
    })
  })

  it('waits for playback config before starting sync when sync is toggled on mid-load', async () => {
    const configDeferred =
      createDeferredValue<Awaited<ReturnType<typeof getPlaybackConfig>>>()
    vi.mocked(getPlaybackConfig).mockReturnValue(configDeferred.promise)

    const { rerender } = renderVideoPlayer()

    await waitFor(() => {
      expect(getPlaybackConfig).toHaveBeenCalled()
    })

    rerender({ item: createItem(), jellyfinPlaybackSyncEnabled: true })
    expect(startPlaybackStatus).not.toHaveBeenCalled()

    await act(async () => {
      configDeferred.resolve({
        strategy: 'hls',
        url: 'https://jellyfin.example/Videos/item-1/master.m3u8?PlaySessionId=hls-session-1',
      })
      await configDeferred.promise
    })

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledTimes(1)
    })
  })

  it('does not start stale direct-play sync when enabling during a new item load', async () => {
    const configDeferred =
      createDeferredValue<Awaited<ReturnType<typeof getPlaybackConfig>>>()
    vi.mocked(getPlaybackConfig)
      .mockResolvedValueOnce({
        strategy: 'direct',
        url: 'https://jellyfin.example/Videos/item-1/stream',
      })
      .mockReturnValueOnce(configDeferred.promise)

    const { result, rerender } = renderVideoPlayer()

    await waitFor(() => {
      expect(result.current.strategy).toBe('direct')
    })

    const directVideo = document.createElement('video')
    directVideo.currentTime = 34
    result.current.videoRef.current = directVideo

    rerender({ item: createItem('item-2'), jellyfinPlaybackSyncEnabled: true })
    expect(startPlaybackStatus).not.toHaveBeenCalled()

    await act(async () => {
      configDeferred.resolve({
        strategy: 'hls',
        url: 'https://jellyfin.example/Videos/item-2/master.m3u8?PlaySessionId=hls-session-2',
      })
      await configDeferred.promise
    })

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item-2',
          playMethod: 'Transcode',
        }),
      )
    })
  })

  it('stops a stale pending playback status with its original position after item change', async () => {
    const startDeferred = createDeferred()
    vi.mocked(createPlaySessionId)
      .mockReturnValueOnce('hls-session-1')
      .mockReturnValue('hls-session-2')
    vi.mocked(startPlaybackStatus)
      .mockReturnValueOnce(startDeferred.promise)
      .mockResolvedValue(undefined)

    const { rerender } = renderVideoPlayer({
      jellyfinPlaybackSyncEnabled: true,
    })

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledTimes(1)
    })

    hlsMocks.videoRef.current!.currentTime = 99

    rerender({ item: createItem('item-2'), jellyfinPlaybackSyncEnabled: true })

    await act(async () => {
      startDeferred.resolve()
      await startDeferred.promise
    })

    await waitFor(() => {
      expect(stopPlaybackStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item-1',
          mediaSourceId: 'item-1-media-source',
          playSessionId: 'hls-session-1',
          positionTicks: 120_000_000,
        }),
      )
    })
  })

  it('preserves pending playback position when stopping without a video element', async () => {
    const startDeferred = createDeferred()
    vi.mocked(startPlaybackStatus).mockReturnValue(startDeferred.promise)

    const video = document.createElement('video')
    video.currentTime = 12
    let activeVideo: HTMLVideoElement | null = video
    const session = {
      itemId: 'item-1',
      mediaSourceId: 'item-1-media-source',
      playSessionId: 'hls-session-1',
      strategy: 'hls' as const,
      syncEnabled: true,
    }

    const { result } = renderHook(() =>
      useJellyfinSession({
        session,
        getActiveVideoElement: () => activeVideo,
      }),
    )

    let startPromise = Promise.resolve()
    act(() => {
      startPromise = result.current.startPlaybackStatus()
    })

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledWith(
        expect.objectContaining({ positionTicks: 120_000_000 }),
      )
    })

    activeVideo = null

    await act(async () => {
      await result.current.stopPlaybackStatus()
    })

    await act(async () => {
      startDeferred.resolve()
      await startPromise
    })

    await waitFor(() => {
      expect(stopPlaybackStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          playSessionId: 'hls-session-1',
          positionTicks: 120_000_000,
        }),
      )
    })
  })

  it('sends keepalive stop on pagehide for an active synced session', async () => {
    renderVideoPlayer({ jellyfinPlaybackSyncEnabled: true })

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledTimes(1)
    })

    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    expect(stopPlaybackStatusKeepalive).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item-1',
        mediaSourceId: 'item-1-media-source',
        playSessionId: 'hls-session-1',
        positionTicks: 120_000_000,
      }),
    )
  })

  it('does not queue active encoding keepalive for direct-play sessions on pagehide', async () => {
    vi.mocked(createPlaySessionId)
      .mockReturnValueOnce('unused-hls-init')
      .mockReturnValueOnce('direct-session-1')
    vi.mocked(getPlaybackConfig).mockResolvedValue({
      strategy: 'direct',
      url: 'https://jellyfin.example/Videos/item-1/stream',
    })

    const { result } = renderVideoPlayer({ jellyfinPlaybackSyncEnabled: true })

    await waitFor(() => {
      expect(result.current.strategy).toBe('direct')
    })

    const directVideo = document.createElement('video')
    directVideo.currentTime = 20
    result.current.videoRef.current = directVideo

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          playSessionId: 'direct-session-1',
          playMethod: 'DirectPlay',
        }),
      )
    })

    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    expect(stopPlaybackStatusKeepalive).toHaveBeenCalledWith(
      expect.objectContaining({
        playSessionId: 'direct-session-1',
        positionTicks: 200_000_000,
      }),
    )
    expect(stopActiveEncodingKeepalive).not.toHaveBeenCalled()
  })

  it('sends keepalive stop on pagehide for a pending synced session', async () => {
    const startDeferred = createDeferred()
    vi.mocked(startPlaybackStatus).mockReturnValue(startDeferred.promise)

    renderVideoPlayer({ jellyfinPlaybackSyncEnabled: true })

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledTimes(1)
    })

    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    expect(stopPlaybackStatusKeepalive).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item-1',
        mediaSourceId: 'item-1-media-source',
        playSessionId: 'hls-session-1',
        positionTicks: 120_000_000,
      }),
    )
    expect(
      vi.mocked(stopPlaybackStatusKeepalive).mock.calls[0]?.[0],
    ).not.toHaveProperty('startId')
    expect(
      vi.mocked(stopPlaybackStatusKeepalive).mock.calls[0]?.[0],
    ).not.toHaveProperty('requestId')

    await act(async () => {
      startDeferred.resolve()
      await startDeferred.promise
    })

    expect(stopPlaybackStatus).not.toHaveBeenCalled()
  })
  it('keeps stale pending keepalive stop on the original session position after item change', async () => {
    const startDeferred = createDeferred()
    vi.mocked(startPlaybackStatus).mockReturnValue(startDeferred.promise)

    const originalVideo = document.createElement('video')
    originalVideo.currentTime = 12
    const nextVideo = document.createElement('video')
    nextVideo.currentTime = 99
    let activeVideo: HTMLVideoElement | null = originalVideo
    const originalSession = {
      itemId: 'item-1',
      mediaSourceId: 'item-1-media-source',
      playSessionId: 'hls-session-1',
      strategy: 'hls' as const,
      syncEnabled: true,
    }
    const nextSession = {
      itemId: 'item-2',
      mediaSourceId: 'item-2-media-source',
      playSessionId: 'hls-session-2',
      strategy: 'hls' as const,
      syncEnabled: true,
    }

    const { result, rerender } = renderHook(
      ({ session }) =>
        useJellyfinSession({
          session,
          getActiveVideoElement: () => activeVideo,
        }),
      { initialProps: { session: originalSession } },
    )

    let startPromise = Promise.resolve()
    act(() => {
      startPromise = result.current.startPlaybackStatus()
    })

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          playSessionId: 'hls-session-1',
          positionTicks: 120_000_000,
        }),
      )
    })

    activeVideo = nextVideo
    rerender({ session: nextSession })

    act(() => {
      result.current.stopAllKeepalive()
    })

    expect(stopPlaybackStatusKeepalive).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item-1',
        mediaSourceId: 'item-1-media-source',
        playSessionId: 'hls-session-1',
        positionTicks: 120_000_000,
      }),
    )

    await act(async () => {
      startDeferred.resolve()
      await startPromise
    })

    expect(stopPlaybackStatus).not.toHaveBeenCalled()
  })

  it('does not promote pending playback status after sync turns off', async () => {
    const startDeferred = createDeferred()
    vi.mocked(startPlaybackStatus).mockReturnValue(startDeferred.promise)
    const video = document.createElement('video')
    video.currentTime = 12
    const session = {
      itemId: 'item-1',
      mediaSourceId: 'item-1-media-source',
      playSessionId: 'hls-session-1',
      strategy: 'hls' as const,
      syncEnabled: true,
    }

    const { result, rerender } = renderHook(
      ({ syncEnabled }: { syncEnabled: boolean }) =>
        useJellyfinSession({
          session: { ...session, syncEnabled },
          getActiveVideoElement: () => video,
        }),
      {
        initialProps: { syncEnabled: true },
      },
    )

    let startPromise = Promise.resolve()
    act(() => {
      startPromise = result.current.startPlaybackStatus()
    })

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledTimes(1)
    })

    rerender({ syncEnabled: false })

    await act(async () => {
      startDeferred.resolve()
      await startPromise
    })

    await waitFor(() => {
      expect(stopPlaybackStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          playSessionId: 'hls-session-1',
          positionTicks: 120_000_000,
        }),
      )
    })
  })

  it('reports playing pause and seek progress while sync is enabled', async () => {
    renderVideoPlayer({ jellyfinPlaybackSyncEnabled: true })

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledTimes(1)
    })

    act(() => {
      hlsMocks.videoRef.current?.dispatchEvent(new Event('playing'))
      hlsMocks.videoRef.current?.dispatchEvent(new Event('pause'))
      hlsMocks.videoRef.current?.dispatchEvent(new Event('seeked'))
    })

    await waitFor(() => {
      expect(reportPlaybackProgress).toHaveBeenCalledTimes(3)
    })
  })

  it('starts direct-play sync with a generated direct play session id', async () => {
    vi.mocked(createPlaySessionId)
      .mockReturnValueOnce('unused-hls-session')
      .mockReturnValueOnce('direct-session-1')
    vi.mocked(getPlaybackConfig).mockResolvedValue({
      strategy: 'direct',
      url: 'https://jellyfin.example/Videos/item-1/stream',
    })

    const { result, rerender } = renderVideoPlayer()

    await waitFor(() => {
      expect(result.current.strategy).toBe('direct')
    })

    const directVideo = document.createElement('video')
    directVideo.currentTime = 34
    result.current.videoRef.current = directVideo

    rerender({ item: createItem(), jellyfinPlaybackSyncEnabled: true })

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledWith({
        itemId: 'item-1',
        mediaSourceId: 'item-1-media-source',
        playSessionId: 'direct-session-1',
        playMethod: 'DirectPlay',
        positionTicks: 340_000_000,
        isPaused: true,
      })
    })

    vi.mocked(reportPlaybackProgress).mockClear()
    directVideo.currentTime = 35

    act(() => {
      directVideo.dispatchEvent(new Event('playing'))
      directVideo.dispatchEvent(new Event('pause'))
      directVideo.dispatchEvent(new Event('seeked'))
    })

    await waitFor(() => {
      expect(reportPlaybackProgress).toHaveBeenCalledTimes(3)
    })
    expect(reportPlaybackProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        playSessionId: 'direct-session-1',
        playMethod: 'DirectPlay',
        positionTicks: 350_000_000,
        isPaused: false,
      }),
    )
    expect(reportPlaybackProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        playSessionId: 'direct-session-1',
        playMethod: 'DirectPlay',
        positionTicks: 350_000_000,
        isPaused: true,
      }),
    )
  })

  it('stops active playback status and does not send further writes after sync is disabled', async () => {
    const { rerender } = renderVideoPlayer({
      jellyfinPlaybackSyncEnabled: true,
    })

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledTimes(1)
    })

    act(() => {
      hlsMocks.videoRef.current?.dispatchEvent(new Event('playing'))
    })

    await waitFor(() => {
      expect(reportPlaybackProgress).toHaveBeenCalledTimes(1)
    })

    vi.mocked(reportPlaybackProgress).mockClear()
    vi.mocked(stopPlaybackStatus).mockClear()

    rerender({ item: createItem(), jellyfinPlaybackSyncEnabled: false })

    await waitFor(() => {
      expect(stopPlaybackStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item-1',
          mediaSourceId: 'item-1-media-source',
          playSessionId: 'hls-session-1',
          positionTicks: 120_000_000,
        }),
      )
    })

    act(() => {
      hlsMocks.videoRef.current?.dispatchEvent(new Event('playing'))
      hlsMocks.videoRef.current?.dispatchEvent(new Event('pause'))
      hlsMocks.videoRef.current?.dispatchEvent(new Event('seeked'))
      window.dispatchEvent(new Event('pagehide'))
    })

    expect(reportPlaybackProgress).not.toHaveBeenCalled()
    expect(stopPlaybackStatusKeepalive).not.toHaveBeenCalled()
    expect(stopActiveEncodingKeepalive).toHaveBeenCalledWith({
      playSessionId: 'hls-session-1',
    })
  })

  it('continues HLS audio reload when previous active encoding cleanup fails', async () => {
    const consoleDebugSpy = vi
      .spyOn(console, 'debug')
      .mockImplementation(() => undefined)
    vi.mocked(stopActiveEncoding).mockRejectedValue(new Error('cleanup failed'))

    try {
      const { result } = renderVideoPlayer()

      await waitFor(() => {
        expect(result.current.videoUrl).toContain('PlaySessionId=hls-session-1')
      })

      await act(async () => {
        await expect(
          result.current.reloadHlsWithUrl({
            url: 'https://jellyfin.example/Videos/item-1/master.m3u8?AudioStreamIndex=2',
            playSessionId: 'hls-session-2',
          }),
        ).resolves.toBeUndefined()
      })

      await waitFor(() => {
        expect(result.current.videoUrl).toContain('AudioStreamIndex=2')
      })

      expect(stopActiveEncoding).toHaveBeenCalledWith({
        playSessionId: 'hls-session-1',
      })
    } finally {
      consoleDebugSpy.mockRestore()
    }
  })

  it('keeps previous HLS encoding available for pagehide keepalive while async stop is pending', async () => {
    const stopEncodingDeferred = createDeferred()
    vi.mocked(stopActiveEncoding).mockReturnValue(stopEncodingDeferred.promise)
    const { result } = renderVideoPlayer()

    await waitFor(() => {
      expect(result.current.videoUrl).toContain('PlaySessionId=hls-session-1')
    })

    let reloadPromise = Promise.resolve()
    act(() => {
      reloadPromise = result.current.reloadHlsWithUrl({
        url: 'https://jellyfin.example/Videos/item-1/master.m3u8?AudioStreamIndex=2',
        playSessionId: 'hls-session-2',
      })
    })

    await waitFor(() => {
      expect(stopActiveEncoding).toHaveBeenCalledWith({
        playSessionId: 'hls-session-1',
      })
    })

    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    expect(stopActiveEncodingKeepalive).toHaveBeenCalledWith({
      playSessionId: 'hls-session-1',
    })

    await act(async () => {
      stopEncodingDeferred.resolve()
      await reloadPromise
    })
  })

  it('starts playback sync with stripped item.Id fallback mediaSourceId when MediaSources[0].Id is missing', async () => {
    vi.mocked(createPlaySessionId).mockReturnValue('hls-session-fallback')
    vi.mocked(getPlaybackConfig).mockResolvedValue({
      strategy: 'hls',
      url: 'https://jellyfin.example/Videos/item-1/master.m3u8?PlaySessionId=hls-session-fallback',
    })

    const itemWithoutMediaSources: BaseItemDto = {
      Id: 'item-no-src',
      Name: 'No Sources Item',
      Type: 'Movie',
    }

    renderHook(() =>
      useVideoPlayer({
        item: itemWithoutMediaSources,
        jellyfinPlaybackSyncEnabled: true,
        t: (key) => key,
      }),
    )

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item-no-src',
          mediaSourceId: 'itemnosrc',
          playSessionId: 'hls-session-fallback',
          playMethod: 'Transcode',
        }),
      )
    })
  })

  it('stops direct-play status and starts HLS Transcode status on direct-to-HLS switch via reloadHlsWithUrl', async () => {
    vi.mocked(createPlaySessionId)
      .mockReturnValueOnce('unused-hls-init')
      .mockReturnValueOnce('direct-session-1')
      .mockReturnValueOnce('hls-fallback-session')

    vi.mocked(getPlaybackConfig).mockResolvedValue({
      strategy: 'direct',
      url: 'https://jellyfin.example/Videos/item-1/stream',
    })

    const { result } = renderVideoPlayer({ jellyfinPlaybackSyncEnabled: true })

    await waitFor(() => {
      expect(result.current.strategy).toBe('direct')
    })

    const directVideo = document.createElement('video')
    directVideo.currentTime = 10
    result.current.videoRef.current = directVideo

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item-1',
          mediaSourceId: 'item-1-media-source',
          playSessionId: 'direct-session-1',
          playMethod: 'DirectPlay',
        }),
      )
    })

    vi.mocked(startPlaybackStatus).mockClear()
    vi.mocked(stopPlaybackStatus).mockClear()

    await act(async () => {
      await result.current.reloadHlsWithUrl({
        url: 'https://jellyfin.example/Videos/item-1/master.m3u8?PlaySessionId=hls-fallback-session',
        playSessionId: 'hls-fallback-session',
      })
    })

    await waitFor(() => {
      expect(stopPlaybackStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item-1',
          mediaSourceId: 'item-1-media-source',
          playSessionId: 'direct-session-1',
        }),
      )
    })

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item-1',
          mediaSourceId: 'item-1-media-source',
          playSessionId: 'hls-fallback-session',
          playMethod: 'Transcode',
          positionTicks: 100_000_000,
        }),
      )
    })

    expect(result.current.strategy).toBe('hls')
  })

  it('calls onStrategyChange with hls on direct-to-HLS switch via reloadHlsWithUrl', async () => {
    vi.mocked(createPlaySessionId)
      .mockReturnValueOnce('unused-hls-init')
      .mockReturnValueOnce('direct-session-1')
      .mockReturnValueOnce('hls-fallback-session')

    vi.mocked(getPlaybackConfig).mockResolvedValue({
      strategy: 'direct',
      url: 'https://jellyfin.example/Videos/item-1/stream',
    })

    const onStrategyChange = vi.fn<(strategy: PlaybackStrategy) => void>()
    const { result } = renderVideoPlayer({
      jellyfinPlaybackSyncEnabled: true,
      onStrategyChange,
    })

    await waitFor(() => {
      expect(result.current.strategy).toBe('direct')
    })

    const directVideo = document.createElement('video')
    directVideo.currentTime = 10
    result.current.videoRef.current = directVideo

    onStrategyChange.mockClear()

    await act(async () => {
      await result.current.reloadHlsWithUrl({
        url: 'https://jellyfin.example/Videos/item-1/master.m3u8?PlaySessionId=hls-fallback-session',
        playSessionId: 'hls-fallback-session',
      })
    })

    await waitFor(() => {
      expect(onStrategyChange).toHaveBeenCalledWith('hls')
    })
  })

  it('preserves direct-play position in HLS Transcode start on direct-to-HLS switch via reloadHlsWithUrl (position=42s)', async () => {
    vi.mocked(createPlaySessionId)
      .mockReset()
      .mockReturnValueOnce('unused-hls-init')
      .mockReturnValueOnce('direct-session-1')
      .mockReturnValueOnce('hls-fallback-session')
      .mockReturnValue('hls-session-1')

    vi.mocked(getPlaybackConfig).mockResolvedValue({
      strategy: 'direct',
      url: 'https://jellyfin.example/Videos/item-1/stream',
    })

    const { result } = renderVideoPlayer({ jellyfinPlaybackSyncEnabled: true })

    await waitFor(() => {
      expect(result.current.strategy).toBe('direct')
    })

    const directVideo = document.createElement('video')
    directVideo.currentTime = 42
    result.current.videoRef.current = directVideo

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          playSessionId: 'direct-session-1',
          playMethod: 'DirectPlay',
        }),
      )
    })

    vi.mocked(startPlaybackStatus).mockClear()
    vi.mocked(stopPlaybackStatus).mockClear()

    await act(async () => {
      await result.current.reloadHlsWithUrl({
        url: 'https://jellyfin.example/Videos/item-1/master.m3u8?PlaySessionId=hls-fallback-session',
        playSessionId: 'hls-fallback-session',
      })
    })

    await waitFor(() => {
      expect(stopPlaybackStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          playSessionId: 'direct-session-1',
        }),
      )
    })

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          playSessionId: 'hls-fallback-session',
          playMethod: 'Transcode',
          positionTicks: 420_000_000,
        }),
      )
    })
  })

  it('uses pending playback position as floor when keepalive stop sees a reset video element', async () => {
    const startDeferred = createDeferred()
    vi.mocked(startPlaybackStatus).mockReturnValue(startDeferred.promise)
    hlsMocks.videoRef.current!.currentTime = 42

    renderVideoPlayer({ jellyfinPlaybackSyncEnabled: true })

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledWith(
        expect.objectContaining({ positionTicks: 420_000_000 }),
      )
    })

    hlsMocks.videoRef.current!.currentTime = 0

    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    expect(stopPlaybackStatusKeepalive).toHaveBeenCalledWith(
      expect.objectContaining({ positionTicks: 420_000_000 }),
    )

    await act(async () => {
      startDeferred.resolve()
      await startDeferred.promise
    })
  })

  it('uses latestPositionTicks fallback when video element is unavailable at stop', async () => {
    vi.mocked(createPlaySessionId).mockReset().mockReturnValue('hls-session-1')

    renderVideoPlayer({ jellyfinPlaybackSyncEnabled: true })

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledTimes(1)
    })

    hlsMocks.videoRef.current!.currentTime = 55

    act(() => {
      hlsMocks.videoRef.current?.dispatchEvent(new Event('playing'))
    })

    await waitFor(() => {
      expect(reportPlaybackProgress).toHaveBeenCalledWith(
        expect.objectContaining({ positionTicks: 550_000_000 }),
      )
    })

    hlsMocks.videoRef.current = null

    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })

    expect(stopPlaybackStatusKeepalive).toHaveBeenCalledWith(
      expect.objectContaining({ positionTicks: 550_000_000 }),
    )
  })

  it('does not start Transcode status with provisional HLS ID when config resolves to direct', async () => {
    const configDeferred = createDeferred()
    vi.mocked(createPlaySessionId)
      .mockReturnValueOnce('unused-hls-init')
      .mockReturnValueOnce('direct-session-1')
    vi.mocked(getPlaybackConfig).mockReturnValue(
      configDeferred.promise.then(() => ({
        strategy: 'direct' as const,
        url: 'https://jellyfin.example/Videos/item-1/stream',
      })),
    )

    const { result } = renderVideoPlayer({ jellyfinPlaybackSyncEnabled: true })

    await waitFor(() => {
      expect(getPlaybackConfig).toHaveBeenCalledWith(
        expect.objectContaining({ Id: 'item-1' }),
        undefined,
        undefined,
        false,
        'unused-hls-init',
      )
    })

    expect(startPlaybackStatus).not.toHaveBeenCalled()

    act(() => {
      configDeferred.resolve()
    })

    const directVideo = document.createElement('video')
    directVideo.currentTime = 0
    result.current.videoRef.current = directVideo

    await waitFor(() => {
      expect(result.current.strategy).toBe('direct')
    })

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          playSessionId: 'direct-session-1',
          playMethod: 'DirectPlay',
        }),
      )
    })

    expect(startPlaybackStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({ playMethod: 'Transcode' }),
    )
  })

  it('threads the current audio stream index into the forced-HLS error fallback', async () => {
    mockDirectPlayThenForcedHlsFallback()

    let currentAudioStreamIndex = 2
    const { container, getPlayer } = renderAudioFallbackHarness({
      getCurrentAudioStreamIndex: () => currentAudioStreamIndex,
    })

    await waitFor(() => {
      expect(getPlaybackConfig).toHaveBeenCalledWith(
        expect.objectContaining({ Id: 'item-1' }),
        undefined,
        2,
        false,
        'unused-initial-hls-session',
      )
    })

    const video = container.querySelector('video')!
    await waitFor(() => {
      expect(video.src).toContain('/Videos/item-1/stream')
    })

    // A native in-session switch moved the session off the initial track.
    currentAudioStreamIndex = 3

    dispatchDirectPlayError(video)

    await waitFor(() => {
      expect(getPlaybackConfig).toHaveBeenCalledWith(
        expect.objectContaining({ Id: 'item-1' }),
        undefined,
        3,
        true,
        'hls-fallback-session',
      )
    })
    await waitFor(() => {
      expect(getPlayer().videoUrl).toContain('AudioStreamIndex=3')
    })
  })

  it("falls back to the session's initial audio index when no current-index getter is provided", async () => {
    mockDirectPlayThenForcedHlsFallback()

    const { container, getPlayer } = renderAudioFallbackHarness()

    const video = container.querySelector('video')!
    await waitFor(() => {
      expect(video.src).toContain('/Videos/item-1/stream')
    })

    dispatchDirectPlayError(video)

    await waitFor(() => {
      expect(getPlaybackConfig).toHaveBeenCalledWith(
        expect.objectContaining({ Id: 'item-1' }),
        undefined,
        2,
        true,
        'hls-fallback-session',
      )
    })
    await waitFor(() => {
      expect(getPlayer().videoUrl).toContain('AudioStreamIndex=2')
    })
  })

  it('resolves the initial audio index per initialization, not per render', async () => {
    const { rerender } = renderVideoPlayer({
      getInitialAudioStreamIndex: () => 2,
    })

    await waitFor(() => {
      expect(getPlaybackConfig).toHaveBeenCalledWith(
        expect.objectContaining({ Id: 'item-1' }),
        undefined,
        2,
        false,
        'hls-session-1',
      )
    })

    // A changed preference mid-session must not re-initialize playback.
    rerender({
      item: createItem(),
      jellyfinPlaybackSyncEnabled: false,
      getInitialAudioStreamIndex: () => 5,
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(getPlaybackConfig).toHaveBeenCalledTimes(1)

    // The next initialization resolves the getter fresh.
    rerender({
      item: createItem('item-2'),
      jellyfinPlaybackSyncEnabled: false,
      getInitialAudioStreamIndex: () => 5,
    })
    await waitFor(() => {
      expect(getPlaybackConfig).toHaveBeenCalledWith(
        expect.objectContaining({ Id: 'item-2' }),
        undefined,
        5,
        false,
        'hls-session-1',
      )
    })
  })

  it('drops an in-flight HLS audio reload when the item changes before it resumes', async () => {
    vi.mocked(createPlaySessionId)
      .mockReset()
      .mockReturnValueOnce('unused-hls-init')
      .mockReturnValueOnce('direct-session-1')
      .mockReturnValue('item-2-hls-session')
    vi.mocked(getPlaybackConfig).mockImplementation(async (item) =>
      item.Id === 'item-1'
        ? {
            strategy: 'direct' as const,
            url: 'https://jellyfin.example/Videos/item-1/stream',
          }
        : {
            strategy: 'hls' as const,
            url: 'https://jellyfin.example/Videos/item-2/master.m3u8?PlaySessionId=item-2-hls-session',
          },
    )

    const { result, rerender } = renderVideoPlayer({
      item: createItem('item-1'),
      jellyfinPlaybackSyncEnabled: true,
    })

    await waitFor(() => {
      expect(result.current.strategy).toBe('direct')
    })

    const directVideo = document.createElement('video')
    directVideo.currentTime = 30
    result.current.videoRef.current = directVideo

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          playSessionId: 'direct-session-1',
          playMethod: 'DirectPlay',
        }),
      )
    })

    // Hold the reload's status cleanup so the item can change while the
    // already-started callback is suspended mid-await.
    const stopDeferred = createDeferred()
    vi.mocked(stopPlaybackStatus).mockReturnValue(stopDeferred.promise)

    let staleReload!: Promise<void>
    act(() => {
      staleReload = result.current.reloadHlsWithUrl({
        url: 'https://jellyfin.example/Videos/item-1/master.m3u8?PlaySessionId=stale-hls-session&AudioStreamIndex=2',
        playSessionId: 'stale-hls-session',
      })
    })

    rerender({
      item: createItem('item-2'),
      jellyfinPlaybackSyncEnabled: true,
    })

    await waitFor(() => {
      expect(result.current.videoUrl).toContain('/Videos/item-2/')
    })

    await act(async () => {
      stopDeferred.resolve()
      await staleReload
    })

    // The released reload must not overwrite the newly loaded item's source
    // or session with the previous item's audio-switch URL.
    expect(result.current.videoUrl).toContain('/Videos/item-2/')
    expect(result.current.videoUrl).not.toContain('stale-hls-session')
    expect(result.current.strategy).toBe('hls')
    expect(startPlaybackStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({ playSessionId: 'stale-hls-session' }),
    )
  })
})
