// @vitest-environment jsdom

import {
  act,
  cleanup,
  render,
  renderHook,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BaseItemDto } from '@/types/jellyfin'
import { useVideoPlayer } from '@/hooks/use-video-player'
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

const hlsMocks = vi.hoisted(() => ({
  videoRef: { current: null as HTMLVideoElement | null },
  hlsRef: { current: null },
  retry: vi.fn(),
}))

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

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function createDeferredValue<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
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
  } as BaseItemDto
}

function renderVideoPlayer(options?: {
  item?: BaseItemDto
  jellyfinPlaybackSyncEnabled?: boolean
}) {
  return renderHook(
    ({
      item,
      jellyfinPlaybackSyncEnabled,
    }: {
      item: BaseItemDto
      jellyfinPlaybackSyncEnabled: boolean
    }) =>
      useVideoPlayer({
        item,
        jellyfinPlaybackSyncEnabled,
        t: (key) => key,
      }),
    {
      initialProps: {
        item: options?.item ?? createItem(),
        jellyfinPlaybackSyncEnabled:
          options?.jellyfinPlaybackSyncEnabled ?? false,
      },
    },
  )
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
    vi.stubGlobal('MediaError', {
      MEDIA_ERR_ABORTED: 1,
      MEDIA_ERR_NETWORK: 2,
      MEDIA_ERR_DECODE: 3,
      MEDIA_ERR_SRC_NOT_SUPPORTED: 4,
    })
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
      return (
        <video ref={player.videoRef}>
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

    Object.defineProperty(video, 'error', {
      configurable: true,
      value: { code: MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED },
    })

    act(() => {
      video.dispatchEvent(new Event('error'))
    })

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

  it('stops stale pending playback status after sync is disabled mid-start', async () => {
    const startDeferred = createDeferred()
    vi.mocked(startPlaybackStatus).mockReturnValue(startDeferred.promise)

    const { rerender } = renderVideoPlayer({
      jellyfinPlaybackSyncEnabled: true,
    })

    await waitFor(() => {
      expect(startPlaybackStatus).toHaveBeenCalledTimes(1)
    })

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
        positionTicks: 120_000_000,
      }),
    )
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
    } as BaseItemDto

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
})
