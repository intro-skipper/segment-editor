// @vitest-environment jsdom
/**
 * The subtitle presenter through the playback engine, on a jsdom <video>
 * with a fake Jellyfin backend and FakeHls. JASSUB (a worker and WASM) is a
 * stub; everything around it is real: when it starts, stops and starts again,
 * the user offset and the resizes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BaseItemDto } from '@/types/jellyfin'
import type { PlaybackStrategy } from '@/services/video/api'
import type * as SubtitleModule from '@/services/video/subtitle'
import type { CreateRendererOptions } from '@/services/video/subtitle'
import { showError } from '@/lib/notifications'
import { PLAYER_CONFIG } from '@/lib/constants'
import { useAppStore } from '@/stores/app-store'
import {
  createItem,
  createPlayback,
  deferred,
  failMedia,
  settle,
} from './helpers/playback-fakes'

const { createRenderer, resize, destroy, setTimeOffset, control } = vi.hoisted(
  () => ({
    createRenderer: vi.fn<(options: CreateRendererOptions) => void>(),
    resize: vi.fn(async () => {}),
    destroy: vi.fn(),
    setTimeOffset: vi.fn<(ticks: number, offset: number) => void>(),
    /** Let a test hold the JASSUB chunk import, or JASSUB's ready, open. */
    control: { preload: Promise.resolve(), ready: Promise.resolve() },
  }),
)

vi.mock('@/services/video/subtitle', async (importOriginal) => ({
  ...(await importOriginal<typeof SubtitleModule>()),
  preloadJassubRenderer: () => control.preload,
  createJassubRenderer: async (options: CreateRendererOptions) => {
    // Like the real renderer, an aborted start creates nothing.
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    createRenderer(options)
    await control.ready
    return {
      instance: { resize },
      destroy,
      setTimeOffset,
      setTrack: async () => {},
    }
  },
}))

vi.mock('@/lib/notifications', () => ({
  showError: vi.fn(),
  showNotification: vi.fn(),
}))

const { RESIZE_DEBOUNCE_MS, FULLSCREEN_RESIZE_DELAY_MS } = PLAYER_CONFIG

const ASS = 3
const SRT = 4

/** An item whose media source `mediaSourceId` has an ASS and an SRT subtitle. */
function subtitledItem(
  id = 'item-1',
  mediaSourceId = `${id}-media-source`,
): BaseItemDto {
  return {
    ...createItem(id),
    MediaSources: [
      {
        Id: mediaSourceId,
        MediaStreams: [
          { Type: 'Subtitle', Index: ASS, Codec: 'ass', Language: 'eng' },
          { Type: 'Subtitle', Index: SRT, Codec: 'srt', Language: 'fre' },
        ],
      },
    ],
  }
}

/** Fires the observer callback the presenter registered on the video element. */
let fireResizeObserver: () => void = () => {}

class FakeResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    fireResizeObserver = () => {
      callback([], this)
    }
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** Gives the element the metadata and layout JASSUB waits for and measures. */
function makeMeasurable(video: HTMLVideoElement) {
  for (const [prop, value] of Object.entries({
    readyState: 1,
    videoWidth: 1280,
    clientWidth: 1280,
    clientHeight: 720,
  })) {
    Object.defineProperty(video, prop, { configurable: true, value })
  }
}

interface StartOptions {
  strategy?: PlaybackStrategy
  /** Whether the element already has metadata and a size. */
  measurable?: boolean
  item?: BaseItemDto
}

/** An engine playing an item with the ASS subtitle selected. */
async function start({
  strategy = 'direct',
  measurable = true,
  item = subtitledItem(),
}: StartOptions = {}) {
  const playback = createPlayback({ strategy })
  // The subtitles' text tracks, which jsdom does not build from <track>.
  const text: Array<{ mode: TextTrackMode }> = [
    { mode: 'showing' },
    { mode: 'disabled' },
  ]
  Object.defineProperty(playback.video, 'textTracks', {
    configurable: true,
    value: text,
  })
  if (measurable) makeMeasurable(playback.video)
  playback.engine.load(item)
  await settle()
  return { ...playback, text, subtitles: playback.engine.subtitles }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  control.preload = Promise.resolve()
  control.ready = Promise.resolve()
  const preferences = useAppStore.getState()
  preferences.setSubtitlesEnabled(true)
  preferences.setPreferredSubtitleLanguage('eng')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  fireResizeObserver = () => {}
})

describe('SubtitlePresenter JASSUB lifecycle', () => {
  it('starts JASSUB over hidden text tracks once the video has metadata', async () => {
    const { video, text } = await start({ measurable: false })
    expect(text.map((track) => track.mode)).toEqual(['disabled', 'disabled'])
    expect(createRenderer).not.toHaveBeenCalled()

    makeMeasurable(video)
    video.dispatchEvent(new Event('loadedmetadata'))
    await settle()

    expect(createRenderer).toHaveBeenCalledTimes(1)
    expect(createRenderer.mock.calls[0][0]).toMatchObject({
      video,
      track: { index: ASS },
      mediaSourceId: 'item-1-media-source',
    })
  })

  it('keeps a working JASSUB when direct play falls back to HLS', async () => {
    const { engine, video } = await start()
    expect(createRenderer).toHaveBeenCalledTimes(1)

    failMedia(video)
    await settle()

    expect(engine.getSnapshot().strategy).toBe('hls')
    expect(createRenderer).toHaveBeenCalledTimes(1)
    expect(destroy).not.toHaveBeenCalled()
  })

  it('starts a failed JASSUB again once playback falls back to HLS', async () => {
    const { engine, video } = await start({ measurable: false })

    failMedia(video)
    await settle()
    expect(showError).toHaveBeenCalledWith(
      'player.subtitle.error.jassubInit',
      'Video error',
    )
    expect(engine.getSnapshot().strategy).toBe('hls')

    makeMeasurable(video)
    video.dispatchEvent(new Event('loadedmetadata'))
    await settle()

    expect(createRenderer).toHaveBeenCalledTimes(1)
  })

  it('builds JASSUB from the newest item object of the load', async () => {
    const preload = deferred()
    control.preload = preload.promise
    const { engine } = await start()
    const renamed = { ...subtitledItem(), Name: 'Renamed while loading' }

    engine.load(renamed)
    preload.resolve()
    await settle()

    expect(createRenderer).toHaveBeenCalledTimes(1)
    expect(createRenderer.mock.calls[0][0].item).toBe(renamed)
  })

  it('keeps a running JASSUB when the item is refetched', async () => {
    const { engine } = await start()

    engine.load({ ...subtitledItem() })
    await settle()

    expect(createRenderer).toHaveBeenCalledTimes(1)
    expect(destroy).not.toHaveBeenCalled()
  })

  it('stops JASSUB for a text subtitle, and starts it again for ASS', async () => {
    const { engine, text } = await start()

    await engine.tracks.selectSubtitle(SRT)
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(text.map((track) => track.mode)).toEqual(['disabled', 'showing'])

    await engine.tracks.selectSubtitle(ASS)
    await settle()
    expect(createRenderer).toHaveBeenCalledTimes(2)
  })

  it('stops JASSUB when another item loads, and starts it for that item', async () => {
    const { engine } = await start()

    engine.load(subtitledItem('item-2'))
    expect(destroy).toHaveBeenCalledTimes(1)
    await settle()

    expect(createRenderer).toHaveBeenCalledTimes(2)
    expect(createRenderer.mock.lastCall?.[0].item.Id).toBe('item-2')
  })

  it('abandons a JASSUB start without an error when another item loads', async () => {
    const preload = deferred()
    control.preload = preload.promise
    const { engine } = await start()

    engine.load(subtitledItem('item-2'))
    preload.resolve()
    await settle()

    expect(showError).not.toHaveBeenCalled()
    expect(createRenderer).toHaveBeenCalledTimes(1)
    expect(createRenderer.mock.calls[0][0].item.Id).toBe('item-2')
  })

  it('stops JASSUB when the player lets go of the element', async () => {
    const { disconnect } = await start()

    disconnect()

    expect(destroy).toHaveBeenCalledTimes(1)
  })
})

describe('SubtitlePresenter offset', () => {
  it('moves a running JASSUB once per change', async () => {
    const { subtitles } = await start()

    subtitles.setOffset(1.5)
    subtitles.setOffset(1.5)

    expect(subtitles.getOffset()).toBe(1.5)
    expect(setTimeOffset).toHaveBeenCalledTimes(1)
    expect(setTimeOffset).toHaveBeenCalledWith(0, 1.5)
  })

  it('starts JASSUB at the offset set before it started', async () => {
    const { video, subtitles } = await start({ measurable: false })

    subtitles.setOffset(-2)
    makeMeasurable(video)
    video.dispatchEvent(new Event('loadedmetadata'))
    await settle()

    expect(createRenderer.mock.calls[0][0].userOffset).toBe(-2)
  })

  it('moves JASSUB to an offset set while it was starting', async () => {
    const ready = deferred()
    control.ready = ready.promise
    const { subtitles } = await start()
    expect(createRenderer.mock.calls[0][0].userOffset).toBe(0)

    subtitles.setOffset(2)
    ready.resolve()
    await settle()

    expect(setTimeOffset).toHaveBeenCalledTimes(1)
    expect(setTimeOffset).toHaveBeenCalledWith(0, 2)
  })

  it('keeps the offset for another version, and resets it for another item and on detach', async () => {
    const { engine, subtitles, disconnect } = await start()
    const listener = vi.fn()
    subtitles.subscribe(listener)
    subtitles.setOffset(2)
    expect(listener).toHaveBeenCalledTimes(1)

    engine.load(subtitledItem('item-1', 'extended'))
    expect(subtitles.getOffset()).toBe(2)

    engine.load(subtitledItem('item-2'))
    expect(subtitles.getOffset()).toBe(0)

    subtitles.setOffset(3)
    disconnect()
    expect(subtitles.getOffset()).toBe(0)
  })
})

describe('SubtitlePresenter resize', () => {
  it('resizes once after a fullscreen change, past the resize observations of its transition', async () => {
    await start()
    vi.useFakeTimers()

    document.dispatchEvent(new Event('fullscreenchange'))
    // The transition animates the layout, so the observer ticks mid-flight.
    vi.advanceTimersByTime(10)
    fireResizeObserver()

    // That tick's own debounce would have measured the video here, while the
    // fullscreen layout is still moving.
    vi.advanceTimersByTime(10 + RESIZE_DEBOUNCE_MS)
    expect(resize).not.toHaveBeenCalled()

    vi.advanceTimersByTime(FULLSCREEN_RESIZE_DELAY_MS - RESIZE_DEBOUNCE_MS)
    expect(resize).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(FULLSCREEN_RESIZE_DELAY_MS)
    expect(resize).toHaveBeenCalledTimes(1)
  })

  it('debounces repeated resize observations forward into one resize', async () => {
    await start()
    vi.useFakeTimers()

    fireResizeObserver()
    vi.advanceTimersByTime(RESIZE_DEBOUNCE_MS - 1)
    fireResizeObserver()
    vi.advanceTimersByTime(RESIZE_DEBOUNCE_MS - 1)
    expect(resize).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(resize).toHaveBeenCalledTimes(1)
  })

  it('drops a resize pending when the player lets go of the element', async () => {
    const { disconnect } = await start()
    vi.useFakeTimers()

    document.dispatchEvent(new Event('fullscreenchange'))
    disconnect()
    vi.advanceTimersByTime(FULLSCREEN_RESIZE_DELAY_MS * 2)

    expect(resize).not.toHaveBeenCalled()
  })
})
