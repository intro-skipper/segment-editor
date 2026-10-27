// @vitest-environment jsdom
/**
 * Regression tests for the playback error and recovery state the player
 * overlays render (intro-skipper/segment-editor-plugin#7: the error overlay
 * never disappeared after playback recovered). They drive hls.js events
 * through a fake and read the engine's status.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { HlsPlayerClass } from '@/services/video/hls-controller'
import {
  FakeHls,
  createItem,
  createPlayback,
  deferred,
  latestHls,
  settle,
} from './helpers/playback-fakes'

const fatalMediaError = { type: 'mediaError', fatal: true }
const fatalNetworkError = { type: 'networkError', fatal: true }
const fatalOtherError = { type: 'otherError', fatal: true }

async function playHls(options: Parameters<typeof createPlayback>[0] = {}) {
  const playback = createPlayback(options)
  playback.engine.load(createItem())
  await settle()
  const hls = latestHls()
  hls.emit(FakeHls.Events.MANIFEST_PARSED)
  return { ...playback, hls }
}

beforeEach(() => {
  FakeHls.instances.length = 0
})

afterEach(() => {
  vi.useRealTimers()
})

describe('HLS error recovery', () => {
  it('plays the resolved URL through hls.js', async () => {
    const { engine, hls, video } = await playHls()

    expect(hls.loadedUrls).toEqual([engine.getSnapshot().videoUrl])
    expect(hls.media).toBe(video)
    expect(hls.config.startPosition).toBe(-1)
  })

  it('clears the error as soon as a fragment buffers after recovery', async () => {
    const { engine, hls } = await playHls()

    hls.emit(FakeHls.Events.ERROR, fatalMediaError)
    expect(engine.getSnapshot().status).toMatchObject({
      kind: 'recovering',
      error: { type: 'media_error' },
    })
    expect(hls.recoverCalls).toBe(1)

    hls.emit(FakeHls.Events.FRAG_BUFFERED)

    expect(engine.getSnapshot().status).toEqual({ kind: 'ready' })
  })

  it('restarts loading on a fatal network error', async () => {
    const { engine, hls } = await playHls()

    hls.emit(FakeHls.Events.ERROR, fatalNetworkError)

    expect(hls.startLoadCalls).toBe(1)
    expect(engine.getSnapshot().status).toMatchObject({
      kind: 'recovering',
      error: { type: 'network_error', recoverable: true },
    })
  })

  it('keeps the same status object when an identical error repeats', async () => {
    const { engine, hls } = await playHls()
    const listener = vi.fn()
    engine.subscribe(listener)

    hls.emit(FakeHls.Events.ERROR, fatalNetworkError)
    const status = engine.getSnapshot().status
    hls.emit(FakeHls.Events.ERROR, fatalNetworkError)

    expect(engine.getSnapshot().status).toBe(status)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('falls back to the recovery timer when no fragment buffers', async () => {
    const { engine, hls } = await playHls()
    vi.useFakeTimers()

    hls.emit(FakeHls.Events.ERROR, fatalMediaError)
    expect(engine.getSnapshot().status.kind).toBe('recovering')

    vi.advanceTimersByTime(2100)

    expect(engine.getSnapshot().status).toEqual({ kind: 'ready' })
  })

  it('keeps unknown fatal errors recoverable and rebuilds hls.js at the current position on retry', async () => {
    const { engine, hls, video } = await playHls()

    hls.emit(FakeHls.Events.ERROR, fatalOtherError)
    expect(engine.getSnapshot().status).toMatchObject({
      kind: 'failed',
      error: { type: 'unknown_error', recoverable: true },
    })

    video.currentTime = 42
    engine.retry()
    // The overlay clears immediately on retry...
    expect(engine.getSnapshot().status).toEqual({ kind: 'ready' })
    expect(hls.destroyed).toBe(true)

    // ...and a fresh instance reloads the source from the same position.
    await settle()
    expect(FakeHls.instances).toHaveLength(2)
    expect(latestHls().loadedUrls).toEqual(hls.loadedUrls)
    expect(latestHls().config.startPosition).toBe(42)
    expect(engine.hlsRef.current).toBe(latestHls())
  })

  it('clears a stuck unknown error once fragments buffer again', async () => {
    const { engine, hls } = await playHls()

    hls.emit(FakeHls.Events.ERROR, fatalOtherError)
    expect(engine.getSnapshot().status.kind).toBe('failed')

    hls.emit(FakeHls.Events.FRAG_BUFFERED)

    expect(engine.getSnapshot().status).toEqual({ kind: 'ready' })
  })

  it('swaps the audio codec when media errors repeat within the swap window', async () => {
    const { hls } = await playHls()

    hls.emit(FakeHls.Events.ERROR, fatalMediaError)
    expect(hls.swapAudioCodecCalls).toBe(0)
    expect(hls.recoverCalls).toBe(1)

    hls.emit(FakeHls.Events.ERROR, fatalMediaError)
    expect(hls.swapAudioCodecCalls).toBe(1)
    expect(hls.recoverCalls).toBe(2)
  })

  it('does not swap the audio codec for a new media error after a successful recovery', async () => {
    const { hls } = await playHls()

    hls.emit(FakeHls.Events.ERROR, fatalMediaError)
    // Playback genuinely recovers: the swap window must reset so the next
    // independent media error does not needlessly swap a working track.
    hls.emit(FakeHls.Events.FRAG_BUFFERED)
    hls.emit(FakeHls.Events.ERROR, fatalMediaError)

    expect(hls.swapAudioCodecCalls).toBe(0)
    expect(hls.recoverCalls).toBe(2)
  })

  it('still resets the swap window when a fragment buffers after the recovery timer expired', async () => {
    const { engine, hls } = await playHls()
    vi.useFakeTimers()

    hls.emit(FakeHls.Events.ERROR, fatalMediaError)
    // The blind fallback timer clears the visible error, but it is not a
    // success signal: the swap window stays armed until playback genuinely
    // progresses.
    vi.advanceTimersByTime(2100)
    expect(engine.getSnapshot().status).toEqual({ kind: 'ready' })

    hls.emit(FakeHls.Events.FRAG_BUFFERED)
    hls.emit(FakeHls.Events.ERROR, fatalMediaError)

    expect(hls.swapAudioCodecCalls).toBe(0)
    expect(hls.recoverCalls).toBe(2)
  })
})

describe('hls.js on-demand loading', () => {
  it('creates no Hls instance when playback unloads before hls.js finishes loading', async () => {
    const hlsJs = deferred<HlsPlayerClass<FakeHls>>()
    const { engine } = createPlayback({ loadHls: () => hlsJs.promise })
    engine.load(createItem())
    await settle()

    engine.load(null)
    hlsJs.resolve(FakeHls)
    await settle()

    expect(FakeHls.instances).toHaveLength(0)
    expect(engine.hlsRef.current).toBeNull()
  })

  it('reports a failed hls.js import as recoverable, and Retry imports it again', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const loadHls = vi
      .fn<() => Promise<HlsPlayerClass<FakeHls>>>()
      .mockRejectedValueOnce(new Error('chunk load failed'))
      .mockResolvedValue(FakeHls)
    const { engine } = createPlayback({ loadHls })
    engine.load(createItem())
    await settle()

    expect(engine.getSnapshot().status).toMatchObject({
      kind: 'failed',
      error: { type: 'unknown_error', recoverable: true },
    })

    engine.retry()
    await settle()

    expect(loadHls).toHaveBeenCalledTimes(2)
    expect(FakeHls.instances).toHaveLength(1)
    expect(engine.getSnapshot().status).toEqual({ kind: 'ready' })
    consoleError.mockRestore()
  })
})

describe('failed playback start', () => {
  it('offers Retry, which resolves the playback config again', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const { engine, backend } = createPlayback()
    backend.getPlaybackConfig.mockRejectedValueOnce(new Error('offline'))
    engine.load(createItem())
    await settle()

    expect(engine.getSnapshot().status).toMatchObject({
      kind: 'failed',
      error: { type: 'unknown_error', recoverable: true },
    })
    expect(FakeHls.instances).toHaveLength(0)

    engine.retry()
    expect(engine.getSnapshot().status).toEqual({ kind: 'resolving' })
    await settle()

    expect(backend.getPlaybackConfig).toHaveBeenCalledTimes(2)
    expect(engine.getSnapshot().status).toEqual({ kind: 'ready' })
    expect(latestHls().loadedUrls).toEqual([engine.getSnapshot().videoUrl])
    consoleError.mockRestore()
  })
})
