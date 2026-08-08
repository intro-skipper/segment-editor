// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BaseItemDto } from '@/types/jellyfin'
import { useJassubRenderer } from '@/hooks/use-jassub-renderer'
import { PLAYER_CONFIG } from '@/lib/constants'
import { createVideo, subtitleTrack } from './helpers/media-fixtures'

const { resizeSpy, destroySpy, createRendererSpy, control } = vi.hoisted(
  () => ({
    resizeSpy: vi.fn(),
    destroySpy: vi.fn(),
    createRendererSpy: vi.fn(),
    /** Lets a test hold the renderer init open across a re-render. */
    control: { preload: Promise.resolve() },
  }),
)

vi.mock('@/services/video/subtitle', () => ({
  requiresJassubRenderer: () => true,
  preloadJassubRenderer: () => control.preload,
  createJassubRenderer: (options: unknown) => {
    createRendererSpy(options)
    return Promise.resolve({
      instance: { resize: resizeSpy },
      destroy: destroySpy,
      setTimeOffset: vi.fn(),
      setTrack: () => Promise.resolve(),
    })
  },
}))

vi.mock('@/lib/notifications', () => ({
  showError: vi.fn(),
}))

/** Fires the observer callback the hook registered on the video element. */
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

const ASS_TRACK = subtitleTrack(2, {
  relativeIndex: 0,
  displayTitle: 'English (ASS)',
  format: 'ASS',
  isExternal: false,
  isDefault: true,
})

const ITEM = { Id: 'item-1', Name: 'Movie', Type: 'Movie' } as BaseItemDto

/** A video the renderer will measure: metadata ready and non-zero layout. */
function createMeasurableVideo() {
  return createVideo({
    clientWidth: 1280,
    clientHeight: 720,
    videoWidth: 1280,
    videoHeight: 720,
    readyState: 1,
  })
}

function renderRenderer() {
  const videoRef = { current: createMeasurableVideo() }
  return renderHook(
    (props: { item: BaseItemDto }) =>
      useJassubRenderer({
        videoRef,
        activeTrack: ASS_TRACK,
        item: props.item,
        transcodingOffsetTicks: 0,
        userOffset: 0,
        t: (key: string) => key,
      }),
    { initialProps: { item: ITEM } },
  )
}

/** Renders the hook against a live renderer and waits for JASSUB to attach. */
async function renderActiveRenderer() {
  const view = renderRenderer()

  await waitFor(() => {
    expect(view.result.current.isActive).toBe(true)
  })

  return view
}

const { RESIZE_DEBOUNCE_MS, FULLSCREEN_RESIZE_DELAY_MS } = PLAYER_CONFIG

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  control.preload = Promise.resolve()
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  fireResizeObserver = () => {}
})

describe('JASSUB renderer resize scheduling', () => {
  it('keeps the fullscreen settle delay when the transition fires a resize observation', async () => {
    await renderActiveRenderer()
    vi.useFakeTimers()

    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    // The transition animates the layout, so the observer ticks mid-flight.
    act(() => {
      vi.advanceTimersByTime(10)
      fireResizeObserver()
    })

    // That tick's own debounce would have measured the video here, while the
    // fullscreen layout is still moving.
    act(() => {
      vi.advanceTimersByTime(10 + RESIZE_DEBOUNCE_MS)
    })
    expect(resizeSpy).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(FULLSCREEN_RESIZE_DELAY_MS - RESIZE_DEBOUNCE_MS)
    })
    expect(resizeSpy).toHaveBeenCalledTimes(1)
  })

  it('debounces repeated resize observations forward into a single measurement', async () => {
    await renderActiveRenderer()
    vi.useFakeTimers()

    act(() => {
      fireResizeObserver()
      vi.advanceTimersByTime(RESIZE_DEBOUNCE_MS - 1)
      fireResizeObserver()
    })
    expect(resizeSpy).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(RESIZE_DEBOUNCE_MS)
    })
    expect(resizeSpy).toHaveBeenCalledTimes(1)
  })

  it('drops a resize scheduled just before unmount', async () => {
    const view = await renderActiveRenderer()
    vi.useFakeTimers()

    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    act(() => {
      view.unmount()
    })
    act(() => {
      vi.advanceTimersByTime(FULLSCREEN_RESIZE_DELAY_MS * 2)
    })

    expect(resizeSpy).not.toHaveBeenCalled()
    expect(destroySpy).toHaveBeenCalled()
  })
})

describe('JASSUB renderer setup reactivity', () => {
  it('does not re-create the renderer when only the item object identity changes', async () => {
    const view = await renderActiveRenderer()

    await act(async () => {
      view.rerender({ item: { ...ITEM } })
    })

    expect(createRendererSpy).toHaveBeenCalledTimes(1)
    expect(destroySpy).not.toHaveBeenCalled()
  })

  it('builds the renderer from the item of the latest render, not the one that started init', async () => {
    let releasePreload!: () => void
    control.preload = new Promise<void>((resolve) => {
      releasePreload = resolve
    })

    const view = renderRenderer()
    const renamed = { ...ITEM, Name: 'Renamed while loading' } as BaseItemDto

    await act(async () => {
      view.rerender({ item: renamed })
    })
    await act(async () => {
      releasePreload()
    })
    await waitFor(() => {
      expect(view.result.current.isActive).toBe(true)
    })

    expect(createRendererSpy).toHaveBeenCalledTimes(1)
    expect(createRendererSpy.mock.calls[0][0]).toMatchObject({ item: renamed })
  })
})
