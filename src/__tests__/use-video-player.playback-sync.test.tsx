// @vitest-environment jsdom
/**
 * The playback engine behind useVideoPlayer, against a fake Jellyfin backend
 * and a real <video>: which source plays, the direct-to-HLS fallback, the
 * position carried across reloads, and what Jellyfin hears about it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PlaybackStrategy } from '@/services/video/api'
import {
  FakeHls,
  configCall,
  createItem,
  createPlayback,
  deferred,
  failMedia,
  latestHls,
  setPaused,
  settle,
} from './helpers/playback-fakes'

const ITEM = {
  itemId: 'item-1',
  mediaSourceId: 'item-1-media-source',
}

const AUDIO_RELOAD = {
  url: 'https://jellyfin.example/Videos/item-1/master.m3u8?PlaySessionId=reload-session&AudioStreamIndex=2',
  playSessionId: 'reload-session',
}

/** Dispatches media events on the element, in order. */
function emit(video: HTMLVideoElement, ...types: Array<string>) {
  for (const type of types) video.dispatchEvent(new Event(type))
}

beforeEach(() => {
  FakeHls.instances.length = 0
})

describe('PlaybackEngine Jellyfin playback sync', () => {
  it('does not report playback status when sync is disabled', async () => {
    const { engine, backend } = createPlayback()
    engine.load(createItem())
    await settle()

    expect(backend.getPlaybackConfig).toHaveBeenCalled()
    expect(backend.start).not.toHaveBeenCalled()
    expect(backend.progress).not.toHaveBeenCalled()
    expect(backend.stop).not.toHaveBeenCalled()
  })

  it('starts playback status with the HLS play session the stream URL embeds', async () => {
    const { engine, video, backend } = createPlayback({ sync: true })
    video.currentTime = 12
    engine.load(createItem())
    await settle()

    const config = configCall(backend, 0)
    expect(config).toMatchObject({
      item: expect.objectContaining({ Id: 'item-1' }),
      audioStreamIndex: undefined,
      forceHls: false,
    })
    expect(backend.start).toHaveBeenCalledWith({
      ...ITEM,
      playSessionId: config.playSessionId,
      playMethod: 'Transcode',
      positionTicks: 120_000_000,
      isPaused: true,
    })
  })

  it('reports direct play under its own play session, never the provisional HLS one', async () => {
    const { engine, video, backend } = createPlayback({ strategy: 'direct' })
    engine.load(createItem())
    await settle()

    video.currentTime = 34
    engine.setSyncEnabled(true)
    await settle()

    expect(backend.start).toHaveBeenCalledTimes(1)
    const directSession = backend.start.mock.calls[0][0].playSessionId
    expect(directSession).not.toBe(configCall(backend, 0).playSessionId)
    expect(backend.start).toHaveBeenCalledWith({
      ...ITEM,
      playSessionId: directSession,
      playMethod: 'DirectPlay',
      positionTicks: 340_000_000,
      isPaused: true,
    })

    vi.useFakeTimers()
    try {
      video.currentTime = 35
      emit(video, 'playing', 'pause', 'seeked')
      vi.advanceTimersByTime(500)
    } finally {
      vi.useRealTimers()
    }

    expect(backend.progress).toHaveBeenCalledTimes(3)
    expect(backend.progress).toHaveBeenCalledWith(
      expect.objectContaining({
        playSessionId: directSession,
        playMethod: 'DirectPlay',
        positionTicks: 350_000_000,
        isPaused: false,
      }),
    )
    expect(backend.progress).toHaveBeenCalledWith(
      expect.objectContaining({
        playSessionId: directSession,
        positionTicks: 350_000_000,
        isPaused: true,
      }),
    )
  })

  it('does not start Transcode status with the provisional HLS id while a direct config resolves', async () => {
    const { engine, backend } = createPlayback({
      strategy: 'direct',
      sync: true,
    })
    const config = deferred<{ strategy: PlaybackStrategy; url: string }>()
    backend.getPlaybackConfig.mockReturnValueOnce(config.promise)
    engine.load(createItem())
    await settle()

    expect(backend.start).not.toHaveBeenCalled()
    config.resolve({
      strategy: 'direct',
      url: 'https://jellyfin.example/Videos/item-1/stream',
    })
    await settle()

    expect(backend.start).toHaveBeenCalledTimes(1)
    expect(backend.start).toHaveBeenCalledWith(
      expect.objectContaining({ playMethod: 'DirectPlay' }),
    )
    expect(backend.start).not.toHaveBeenCalledWith(
      expect.objectContaining({
        playSessionId: configCall(backend, 0).playSessionId,
      }),
    )
  })

  it('falls back from direct play to HLS at the direct position, as a new Transcode session', async () => {
    const { engine, video, backend } = createPlayback({
      strategy: 'direct',
      sync: true,
    })
    engine.load(createItem())
    await settle()

    const directStart = backend.start.mock.calls[0][0]
    expect(directStart).toMatchObject({
      playMethod: 'DirectPlay',
      positionTicks: 0,
    })

    video.currentTime = 42
    failMedia(video)
    await settle()

    expect(backend.stop).toHaveBeenCalledWith(
      expect.objectContaining({
        ...ITEM,
        playSessionId: directStart.playSessionId,
        playMethod: 'DirectPlay',
        positionTicks: 420_000_000,
      }),
    )
    const forced = configCall(backend, 1)
    expect(forced.forceHls).toBe(true)
    expect(forced.playSessionId).not.toBe(configCall(backend, 0).playSessionId)
    expect(forced.playSessionId).not.toBe(directStart.playSessionId)
    expect(backend.start).toHaveBeenLastCalledWith({
      ...ITEM,
      playSessionId: forced.playSessionId,
      playMethod: 'Transcode',
      positionTicks: 420_000_000,
      isPaused: true,
    })
    expect(engine.getSnapshot().strategy).toBe('hls')
  })

  it('stops a pending start once it resolves when sync is disabled meanwhile', async () => {
    const { engine, video, backend } = createPlayback({ sync: true })
    const start = deferred()
    backend.start.mockReturnValueOnce(start.promise)
    video.currentTime = 12
    engine.load(createItem())
    await settle()
    expect(backend.start).toHaveBeenCalledTimes(1)

    video.currentTime = 34
    engine.setSyncEnabled(false)
    start.resolve()
    await settle()
    emit(video, 'playing')

    expect(backend.progress).not.toHaveBeenCalled()
    expect(backend.stop).toHaveBeenCalledTimes(1)
    expect(backend.stop).toHaveBeenCalledWith(
      expect.objectContaining({
        ...ITEM,
        playSessionId: configCall(backend, 0).playSessionId,
        positionTicks: 340_000_000,
      }),
    )
    expect(backend.stop.mock.calls[0][0]).not.toHaveProperty('startId')
    expect(backend.stop.mock.calls[0][0]).not.toHaveProperty('requestId')
  })

  it('reuses a pending start when sync is re-enabled before it resolves', async () => {
    const { engine, video, backend } = createPlayback({ sync: true })
    const start = deferred()
    backend.start.mockReturnValueOnce(start.promise)
    engine.load(createItem())
    await settle()

    engine.setSyncEnabled(false)
    engine.setSyncEnabled(true)
    expect(backend.start).toHaveBeenCalledTimes(1)

    start.resolve()
    await settle()
    expect(backend.stop).not.toHaveBeenCalled()

    emit(video, 'playing')
    expect(backend.progress).toHaveBeenCalledWith(
      expect.objectContaining({
        playSessionId: configCall(backend, 0).playSessionId,
        playMethod: 'Transcode',
      }),
    )
    expect(backend.progress.mock.calls[0][0]).not.toHaveProperty('startId')
  })

  it('starts immediately when sync is turned on after the source loaded', async () => {
    const { engine, backend } = createPlayback()
    engine.load(createItem())
    await settle()

    engine.setSyncEnabled(true)

    expect(backend.start).toHaveBeenCalledTimes(1)
  })

  it('waits for the config when sync is turned on mid-load', async () => {
    const { engine, backend } = createPlayback()
    const config = deferred<{ strategy: PlaybackStrategy; url: string }>()
    backend.getPlaybackConfig.mockReturnValueOnce(config.promise)
    engine.load(createItem())

    engine.setSyncEnabled(true)
    expect(backend.start).not.toHaveBeenCalled()

    config.resolve({
      strategy: 'hls',
      url: 'https://jellyfin.example/Videos/item-1/master.m3u8',
    })
    await settle()
    expect(backend.start).toHaveBeenCalledTimes(1)
  })

  it('enabling sync while the next item loads reports only the next item', async () => {
    const { engine, backend } = createPlayback({ strategy: 'direct' })
    engine.load(createItem())
    await settle()

    const config = deferred<{ strategy: PlaybackStrategy; url: string }>()
    backend.getPlaybackConfig.mockReturnValueOnce(config.promise)
    engine.load(createItem('item-2'))
    engine.setSyncEnabled(true)
    expect(backend.start).not.toHaveBeenCalled()

    config.resolve({
      strategy: 'hls',
      url: 'https://jellyfin.example/Videos/item-2/master.m3u8',
    })
    await settle()

    expect(backend.start).toHaveBeenCalledTimes(1)
    expect(backend.start).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item-2', playMethod: 'Transcode' }),
    )
  })

  it('stops a pending start at its own position after the item changes', async () => {
    const { engine, video, backend } = createPlayback({ sync: true })
    const start = deferred()
    backend.start.mockReturnValueOnce(start.promise)
    video.currentTime = 12
    engine.load(createItem())
    await settle()

    video.currentTime = 99
    engine.load(createItem('item-2'))
    start.resolve()
    await settle()

    expect(backend.stop).toHaveBeenCalledWith(
      expect.objectContaining({
        ...ITEM,
        playSessionId: configCall(backend, 0).playSessionId,
        positionTicks: 120_000_000,
      }),
    )
  })

  it('reports playing, pause and seek progress while sync is enabled', async () => {
    const { engine, video, backend } = createPlayback({ sync: true })
    engine.load(createItem())
    await settle()

    vi.useFakeTimers()
    try {
      emit(video, 'playing', 'pause', 'seeked')
      vi.advanceTimersByTime(500)
    } finally {
      vi.useRealTimers()
    }

    expect(backend.progress).toHaveBeenCalledTimes(3)
  })

  it('coalesces a burst of seeks into one trailing progress report', async () => {
    const { engine, video, backend } = createPlayback({ sync: true })
    engine.load(createItem())
    await settle()

    vi.useFakeTimers()
    try {
      for (let i = 0; i < 5; i++) {
        video.currentTime = 20 + i
        emit(video, 'seeked')
      }
      expect(backend.progress).not.toHaveBeenCalled()

      vi.advanceTimersByTime(500)
      expect(backend.progress).toHaveBeenCalledTimes(1)
      expect(backend.progress).toHaveBeenCalledWith(
        expect.objectContaining({ positionTicks: 240_000_000 }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops at the seek position when unmounted before the seek report fires', async () => {
    const { engine, video, media, backend, disconnect } = createPlayback({
      sync: true,
    })
    engine.load(createItem())
    await settle()

    video.currentTime = 42
    emit(video, 'seeked')
    // React detaches the video ref before passive cleanups run on unmount.
    media.current = null
    disconnect()

    expect(backend.stop).toHaveBeenCalledWith(
      expect.objectContaining({ positionTicks: 420_000_000 }),
    )
  })

  it('stops at the playing position when the item changes, before the source resets it', async () => {
    const { engine, video, backend } = createPlayback({ sync: true })
    engine.load(createItem())
    await settle()

    video.currentTime = 42
    engine.load(createItem('item-2'))

    expect(backend.stop).toHaveBeenCalledWith(
      expect.objectContaining({ ...ITEM, positionTicks: 420_000_000 }),
    )
  })

  it('stops reporting when sync is disabled, but still keepalive-stops the transcode on pagehide', async () => {
    const { engine, video, backend } = createPlayback({ sync: true })
    video.currentTime = 12
    engine.load(createItem())
    await settle()
    emit(video, 'playing')
    expect(backend.progress).toHaveBeenCalledTimes(1)
    backend.progress.mockClear()

    engine.setSyncEnabled(false)
    const playSessionId = configCall(backend, 0).playSessionId
    expect(backend.stop).toHaveBeenCalledWith(
      expect.objectContaining({
        ...ITEM,
        playSessionId,
        positionTicks: 120_000_000,
      }),
    )

    vi.useFakeTimers()
    try {
      emit(video, 'playing', 'pause', 'seeked')
      window.dispatchEvent(new Event('pagehide'))
      vi.advanceTimersByTime(500)
    } finally {
      vi.useRealTimers()
    }

    expect(backend.progress).not.toHaveBeenCalled()
    expect(backend.stopKeepalive).not.toHaveBeenCalled()
    expect(backend.stopEncodingKeepalive).toHaveBeenCalledWith(playSessionId)
  })

  it('reports the media source as the stripped item id when the item lists none', async () => {
    const { engine, backend } = createPlayback({ sync: true })
    engine.load({ Id: 'item-no-src', Name: 'No Sources Item', Type: 'Movie' })
    await settle()

    expect(backend.start).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item-no-src',
        mediaSourceId: 'itemnosrc',
        playMethod: 'Transcode',
      }),
    )
  })
})

describe('PlaybackEngine pagehide', () => {
  it('keepalive-stops an active session', async () => {
    const { engine, video, backend } = createPlayback({ sync: true })
    video.currentTime = 12
    engine.load(createItem())
    await settle()

    window.dispatchEvent(new Event('pagehide'))

    expect(backend.stopKeepalive).toHaveBeenCalledWith(
      expect.objectContaining({
        ...ITEM,
        playSessionId: configCall(backend, 0).playSessionId,
        positionTicks: 120_000_000,
      }),
    )
  })

  it('keepalive-stops a direct session without touching active encodings', async () => {
    const { engine, video, backend } = createPlayback({
      strategy: 'direct',
      sync: true,
    })
    engine.load(createItem())
    await settle()

    video.currentTime = 20
    window.dispatchEvent(new Event('pagehide'))

    expect(backend.stopKeepalive).toHaveBeenCalledWith(
      expect.objectContaining({
        playSessionId: backend.start.mock.calls[0][0].playSessionId,
        positionTicks: 200_000_000,
      }),
    )
    expect(backend.stopEncodingKeepalive).not.toHaveBeenCalled()
  })

  it('keepalive-stops a pending session, which then stays stopped', async () => {
    const { engine, video, backend } = createPlayback({ sync: true })
    const start = deferred()
    backend.start.mockReturnValueOnce(start.promise)
    video.currentTime = 12
    engine.load(createItem())
    await settle()

    window.dispatchEvent(new Event('pagehide'))

    expect(backend.stopKeepalive).toHaveBeenCalledWith(
      expect.objectContaining({
        ...ITEM,
        playSessionId: configCall(backend, 0).playSessionId,
        positionTicks: 120_000_000,
      }),
    )
    expect(backend.stopKeepalive.mock.calls[0][0]).not.toHaveProperty('startId')

    start.resolve()
    await settle()
    expect(backend.stop).not.toHaveBeenCalled()
  })

  it('keeps the pending start position when the element has reset to 0', async () => {
    const { engine, video, backend } = createPlayback({ sync: true })
    const start = deferred()
    backend.start.mockReturnValueOnce(start.promise)
    video.currentTime = 42
    engine.load(createItem())
    await settle()

    video.currentTime = 0
    window.dispatchEvent(new Event('pagehide'))

    expect(backend.stopKeepalive).toHaveBeenCalledWith(
      expect.objectContaining({ positionTicks: 420_000_000 }),
    )
    start.resolve()
  })

  it('uses the last reported position once the element is gone', async () => {
    const { engine, video, media, backend } = createPlayback({ sync: true })
    engine.load(createItem())
    await settle()

    video.currentTime = 55
    emit(video, 'playing')
    expect(backend.progress).toHaveBeenCalledWith(
      expect.objectContaining({ positionTicks: 550_000_000 }),
    )

    media.current = null
    window.dispatchEvent(new Event('pagehide'))

    expect(backend.stopKeepalive).toHaveBeenCalledWith(
      expect.objectContaining({ positionTicks: 550_000_000 }),
    )
  })
})

describe('PlaybackEngine HLS audio reload', () => {
  it('continues when stopping the previous encoding fails', async () => {
    const consoleDebug = vi
      .spyOn(console, 'debug')
      .mockImplementation(() => undefined)
    const { engine, backend } = createPlayback()
    backend.stopEncoding.mockRejectedValue(new Error('cleanup failed'))
    engine.load(createItem())
    await settle()

    await expect(engine.reloadHlsWithUrl(AUDIO_RELOAD)).resolves.toBe(undefined)

    expect(backend.stopEncoding).toHaveBeenCalledWith(
      configCall(backend, 0).playSessionId,
    )
    expect(engine.getSnapshot().videoUrl).toBe(AUDIO_RELOAD.url)
    consoleDebug.mockRestore()
  })

  it('keeps the previous encoding keepalive-stoppable while its stop is pending', async () => {
    const { engine, backend } = createPlayback()
    const stopEncoding = deferred()
    backend.stopEncoding.mockReturnValueOnce(stopEncoding.promise)
    engine.load(createItem())
    await settle()

    const reload = engine.reloadHlsWithUrl(AUDIO_RELOAD)
    await settle()
    const previous = configCall(backend, 0).playSessionId
    expect(backend.stopEncoding).toHaveBeenCalledWith(previous)

    window.dispatchEvent(new Event('pagehide'))
    expect(backend.stopEncodingKeepalive).toHaveBeenCalledWith(previous)

    stopEncoding.resolve()
    await reload
  })

  it('switches direct play to a Transcode session at the direct position', async () => {
    const onStrategyChange = vi.fn<(strategy: PlaybackStrategy) => void>()
    const { engine, video, backend } = createPlayback({
      strategy: 'direct',
      sync: true,
      host: { onStrategyChange },
    })
    engine.load(createItem())
    await settle()
    const directSession = backend.start.mock.calls[0][0].playSessionId
    onStrategyChange.mockClear()

    video.currentTime = 42
    await engine.reloadHlsWithUrl(AUDIO_RELOAD)

    expect(backend.stop).toHaveBeenCalledWith(
      expect.objectContaining({
        ...ITEM,
        playSessionId: directSession,
        playMethod: 'DirectPlay',
        positionTicks: 420_000_000,
      }),
    )
    expect(backend.start).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ...ITEM,
        playSessionId: AUDIO_RELOAD.playSessionId,
        playMethod: 'Transcode',
        positionTicks: 420_000_000,
      }),
    )
    expect(engine.getSnapshot().strategy).toBe('hls')
    expect(onStrategyChange).toHaveBeenCalledWith('hls')
  })

  it('pauses direct play before reloading, then resumes once the stream can play', async () => {
    const { engine, video } = createPlayback({ strategy: 'direct' })
    engine.load(createItem())
    await settle()

    setPaused(video, false)
    await engine.reloadHlsWithUrl(AUDIO_RELOAD)

    // load() alone pauses without the 'pause' event the controls follow.
    expect(video.pause).toHaveBeenCalledTimes(1)
    emit(video, 'canplay')
    expect(video.play).toHaveBeenCalledTimes(1)
  })

  it('drops an in-flight reload when the item changes before it resumes', async () => {
    const { engine, video, backend } = createPlayback({
      strategy: 'direct',
      sync: true,
    })
    engine.load(createItem())
    await settle()

    const stop = deferred()
    backend.stop.mockReturnValueOnce(stop.promise)
    video.currentTime = 30
    const staleReload = engine.reloadHlsWithUrl(AUDIO_RELOAD)

    backend.getPlaybackConfig.mockResolvedValueOnce({
      strategy: 'hls',
      url: 'https://jellyfin.example/Videos/item-2/master.m3u8',
    })
    engine.load(createItem('item-2'))
    await settle()
    expect(engine.getSnapshot().videoUrl).toContain('/Videos/item-2/')

    stop.resolve()
    await staleReload

    expect(engine.getSnapshot()).toMatchObject({
      strategy: 'hls',
      videoUrl: 'https://jellyfin.example/Videos/item-2/master.m3u8',
    })
    expect(backend.start).not.toHaveBeenCalledWith(
      expect.objectContaining({ playSessionId: AUDIO_RELOAD.playSessionId }),
    )
    // Nor does it stop the next item's transcode as its "previous" encoding.
    expect(backend.stopEncoding).not.toHaveBeenCalled()
  })

  it('ignores the error the browser fires for the direct source it releases', async () => {
    const { engine, video, backend } = createPlayback({ strategy: 'direct' })
    engine.load(createItem())
    await settle()

    await engine.reloadHlsWithUrl(AUDIO_RELOAD)
    failMedia(video)
    await settle()

    expect(backend.getPlaybackConfig).toHaveBeenCalledTimes(1)
    expect(engine.getSnapshot().status).toEqual({ kind: 'ready' })
  })
})

describe('PlaybackEngine sources', () => {
  it('falls back to forced HLS with a new play session on a direct media error', async () => {
    const onStrategyChange = vi.fn<(strategy: PlaybackStrategy) => void>()
    const { engine, video, backend } = createPlayback({
      strategy: 'direct',
      host: { onStrategyChange },
    })
    engine.load(createItem())
    await settle()
    expect(video.getAttribute('src')).toBe(
      'https://jellyfin.example/Videos/item-1/stream',
    )
    expect(engine.hlsRef.current).toBeNull()

    failMedia(video)
    expect(engine.getSnapshot().status).toMatchObject({
      kind: 'failed',
      error: { type: 'media_error', recoverable: true },
    })
    await settle()

    const forced = configCall(backend, 1)
    expect(forced).toMatchObject({
      item: expect.objectContaining({ Id: 'item-1' }),
      forceHls: true,
    })
    expect(forced.playSessionId).not.toBe(configCall(backend, 0).playSessionId)
    expect(engine.getSnapshot()).toMatchObject({
      strategy: 'hls',
      videoUrl: expect.stringContaining(
        `PlaySessionId=${forced.playSessionId}`,
      ),
      status: { kind: 'ready' },
    })
    expect(onStrategyChange.mock.calls).toEqual([['direct'], ['hls']])
    expect(engine.hlsRef.current).toBe(latestHls())
    expect(latestHls().media).toBe(video)
  })

  it('releases the direct source when it falls back', async () => {
    const { engine, video } = createPlayback({ strategy: 'direct' })
    engine.load(createItem())
    await settle()

    failMedia(video)
    await settle()

    expect(video.hasAttribute('src')).toBe(false)
    expect(video.load).toHaveBeenCalledTimes(1)
  })

  it('releases the direct source on unmount, after the ref let go of the element', async () => {
    const { engine, video, media, disconnect } = createPlayback({
      strategy: 'direct',
    })
    engine.load(createItem())
    await settle()

    media.current = null
    disconnect()

    expect(video.hasAttribute('src')).toBe(false)
    expect(video.load).toHaveBeenCalledTimes(1)
  })

  it('drops a fallback whose status stop resolves after the item changed', async () => {
    const { engine, video, backend } = createPlayback({
      strategy: 'direct',
      sync: true,
    })
    engine.load(createItem())
    await settle()

    const stop = deferred()
    backend.stop.mockReturnValueOnce(stop.promise)
    failMedia(video)
    engine.load(null)
    stop.resolve()
    await settle()

    expect(backend.getPlaybackConfig).toHaveBeenCalledTimes(1)
  })

  it('drops a fallback whose forced config resolves after the item changed', async () => {
    const { engine, video, backend } = createPlayback({
      strategy: 'direct',
      sync: true,
    })
    engine.load(createItem())
    await settle()

    const forcedConfig = deferred<{ strategy: PlaybackStrategy; url: string }>()
    backend.getPlaybackConfig.mockReturnValueOnce(forcedConfig.promise)
    failMedia(video)
    await settle()
    const forced = configCall(backend, 1)
    expect(forced.forceHls).toBe(true)

    engine.load(null)
    forcedConfig.resolve({
      strategy: 'hls',
      url: 'https://jellyfin.example/Videos/item-1/master.m3u8',
    })
    await settle()

    expect(backend.start).not.toHaveBeenCalledWith(
      expect.objectContaining({ playSessionId: forced.playSessionId }),
    )
    expect(engine.getSnapshot()).toMatchObject({
      itemId: null,
      strategy: 'direct',
    })
    expect(FakeHls.instances).toHaveLength(0)
  })

  it('reloads once on a direct network error before falling back', async () => {
    const { engine, video, backend } = createPlayback({ strategy: 'direct' })
    engine.load(createItem())
    await settle()

    failMedia(video, MediaError.MEDIA_ERR_NETWORK)
    await settle()
    expect(video.load).toHaveBeenCalledTimes(1)
    expect(backend.getPlaybackConfig).toHaveBeenCalledTimes(1)
    expect(engine.getSnapshot().status).toEqual({ kind: 'ready' })

    failMedia(video, MediaError.MEDIA_ERR_NETWORK)
    await settle()
    expect(configCall(backend, 1).forceHls).toBe(true)
  })

  it('reloads the direct source on retry, with the network retry available again', async () => {
    const { engine, video, backend } = createPlayback({ strategy: 'direct' })
    engine.load(createItem())
    await settle()

    failMedia(video, MediaError.MEDIA_ERR_NETWORK)
    engine.retry()
    expect(video.load).toHaveBeenCalledTimes(2)

    failMedia(video, MediaError.MEDIA_ERR_NETWORK)
    await settle()
    expect(video.load).toHaveBeenCalledTimes(3)
    expect(backend.getPlaybackConfig).toHaveBeenCalledTimes(1)
  })

  it('restores position and play state once the fallback stream can play', async () => {
    const { engine, video } = createPlayback({ strategy: 'direct' })
    engine.load(createItem())
    await settle()

    video.currentTime = 42
    setPaused(video, false)
    failMedia(video)
    await settle()
    // The new stream starts from the beginning.
    video.currentTime = 0
    expect(video.play).not.toHaveBeenCalled()

    emit(video, 'canplay')

    expect(video.currentTime).toBe(42)
    expect(video.play).toHaveBeenCalledTimes(1)
  })

  it('carries the position, not playback, when a paused session reloads its audio', async () => {
    const { engine, video } = createPlayback()
    engine.load(createItem())
    await settle()

    video.currentTime = 42
    await engine.reloadHlsWithUrl(AUDIO_RELOAD)
    video.currentTime = 0
    emit(video, 'canplay')

    expect(video.currentTime).toBe(42)
    expect(video.play).not.toHaveBeenCalled()
  })

  it('carries the position to another media source of the same item', async () => {
    const { engine, video, backend } = createPlayback({ sync: true })
    engine.load(createItem())
    await settle()

    video.currentTime = 42
    engine.load({ ...createItem(), MediaSources: [{ Id: 'other-source' }] })
    await settle()
    video.currentTime = 0
    emit(video, 'canplay')

    expect(video.currentTime).toBe(42)
    expect(backend.start).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mediaSourceId: 'other-source',
        positionTicks: 420_000_000,
      }),
    )
  })

  it('starts a different item from the beginning', async () => {
    const { engine, video } = createPlayback()
    engine.load(createItem())
    await settle()

    video.currentTime = 42
    engine.load(createItem('item-2'))
    await settle()
    video.currentTime = 0
    emit(video, 'canplay')

    expect(video.currentTime).toBe(0)
  })

  it('hides the previous item’s error while the next item resolves', async () => {
    const { engine, backend } = createPlayback()
    engine.load(createItem())
    await settle()
    latestHls().emit(FakeHls.Events.ERROR, { fatal: true, type: 'otherError' })
    expect(engine.getSnapshot().status.kind).toBe('failed')

    const config = deferred<{ strategy: PlaybackStrategy; url: string }>()
    backend.getPlaybackConfig.mockReturnValueOnce(config.promise)
    engine.load(createItem('item-2'))

    expect(engine.getSnapshot()).toMatchObject({
      itemId: 'item-2',
      status: { kind: 'resolving' },
    })
    config.resolve({ strategy: 'hls', url: 'https://jellyfin.example/2.m3u8' })
    await settle()
    expect(engine.getSnapshot().status).toEqual({ kind: 'ready' })
  })

  it('drops a config that resolves after the item changed', async () => {
    const { engine, backend } = createPlayback({ sync: true })
    const staleConfig = deferred<{ strategy: PlaybackStrategy; url: string }>()
    backend.getPlaybackConfig.mockReturnValueOnce(staleConfig.promise)
    engine.load(createItem())
    engine.load(createItem('item-2'))
    await settle()

    staleConfig.resolve({
      strategy: 'direct',
      url: 'https://jellyfin.example/Videos/item-1/stream',
    })
    await settle()

    expect(engine.getSnapshot()).toMatchObject({
      itemId: 'item-2',
      strategy: 'hls',
      videoUrl: expect.stringContaining('/Videos/item-2/'),
    })
    expect(backend.start).toHaveBeenCalledTimes(1)
    expect(FakeHls.instances).toHaveLength(1)
  })

  it('swaps in a refetched item without reloading', async () => {
    const { engine, backend } = createPlayback()
    engine.load(createItem())
    await settle()

    engine.load(createItem())
    await settle()

    expect(backend.getPlaybackConfig).toHaveBeenCalledTimes(1)
    expect(FakeHls.instances).toHaveLength(1)
  })
})

describe('PlaybackEngine audio stream selection', () => {
  it('falls back to HLS on the audio stream currently playing', async () => {
    let currentAudioStreamIndex = 2
    const { engine, video, backend } = createPlayback({
      strategy: 'direct',
      host: {
        getInitialAudioStreamIndex: () => 2,
        getCurrentAudioStreamIndex: () => currentAudioStreamIndex,
      },
    })
    engine.load(createItem())
    await settle()
    expect(configCall(backend, 0).audioStreamIndex).toBe(2)

    // A native in-session switch moved the session off the initial track.
    currentAudioStreamIndex = 3
    failMedia(video)
    await settle()

    expect(configCall(backend, 1)).toMatchObject({
      audioStreamIndex: 3,
      forceHls: true,
    })
    expect(engine.getSnapshot().videoUrl).toContain('AudioStreamIndex=3')
  })

  it('falls back to HLS on the initial audio stream without a current-stream getter', async () => {
    const { engine, video, backend } = createPlayback({
      strategy: 'direct',
      host: { getInitialAudioStreamIndex: () => 2 },
    })
    engine.load(createItem())
    await settle()

    failMedia(video)
    await settle()

    expect(configCall(backend, 1)).toMatchObject({
      audioStreamIndex: 2,
      forceHls: true,
    })
  })

  it('reads the initial audio stream once per load', async () => {
    const { engine, backend } = createPlayback({
      host: { getInitialAudioStreamIndex: () => 2 },
    })
    engine.load(createItem())
    await settle()
    expect(configCall(backend, 0).audioStreamIndex).toBe(2)

    // A changed preference mid-session must not reload playback.
    engine.setHost({ t: (key) => key, getInitialAudioStreamIndex: () => 5 })
    engine.load(createItem())
    await settle()
    expect(backend.getPlaybackConfig).toHaveBeenCalledTimes(1)

    engine.load(createItem('item-2'))
    await settle()
    expect(configCall(backend, 1)).toMatchObject({
      item: expect.objectContaining({ Id: 'item-2' }),
      audioStreamIndex: 5,
    })
  })
})
