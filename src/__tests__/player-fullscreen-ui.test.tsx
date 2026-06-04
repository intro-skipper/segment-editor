/**
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MouseEvent, TouchEvent } from 'react'

import { useFullscreenPlayerUi } from '@/components/player/use-fullscreen-player-ui'
import { PLAYER_CONFIG } from '@/lib/constants'

const {
  CONTROLS_HIDE_DELAY_MS,
  DOUBLE_TAP_THRESHOLD_MS,
  MOUSE_MOVE_THROTTLE_MS,
} = PLAYER_CONFIG

interface RenderFullscreenUiOptions {
  onTogglePlay?: () => void
  onResizeSubtitleRenderer?: () => void
}

let fullscreenElement: Element | null = null
let originalFullscreenElementDescriptor: PropertyDescriptor | undefined
let rafCallbacks: Array<FrameRequestCallback> = []
let nextRafId = 1
let cancelAnimationFrameMock: (handle: number) => void

function renderFullscreenUi(options: RenderFullscreenUiOptions = {}) {
  const onTogglePlay = options.onTogglePlay ?? vi.fn()
  const onResizeSubtitleRenderer = options.onResizeSubtitleRenderer ?? vi.fn()

  return {
    ...renderHook(() =>
      useFullscreenPlayerUi({
        onTogglePlay,
        onResizeSubtitleRenderer,
      }),
    ),
    onTogglePlay,
    onResizeSubtitleRenderer,
  }
}

function dispatchFullscreenChange(element: Element | null) {
  fullscreenElement = element
  act(() => {
    document.dispatchEvent(new Event('fullscreenchange'))
  })
}

function flushNextAnimationFrame() {
  const callback = rafCallbacks.shift()
  if (!callback) throw new Error('Expected queued animation frame')

  act(() => {
    callback(performance.now())
  })
}

function createMouseInteraction(target: HTMLElement, detail = 1): MouseEvent {
  return { target, detail } as unknown as MouseEvent
}

function createTouchInteraction(
  target: HTMLElement,
  preventDefault = vi.fn(),
): TouchEvent {
  return {
    target,
    changedTouches: [{}],
    preventDefault,
  } as unknown as TouchEvent
}

describe('useFullscreenPlayerUi', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(1_000)
    fullscreenElement = null
    originalFullscreenElementDescriptor = Object.getOwnPropertyDescriptor(
      document,
      'fullscreenElement',
    )
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    })

    rafCallbacks = []
    nextRafId = 1
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        rafCallbacks.push(callback)
        return nextRafId++
      }),
    )
    cancelAnimationFrameMock = vi.fn()
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()

    if (originalFullscreenElementDescriptor) {
      Object.defineProperty(
        document,
        'fullscreenElement',
        originalFullscreenElementDescriptor,
      )
    } else {
      Reflect.deleteProperty(document, 'fullscreenElement')
    }
    vi.unstubAllGlobals()
  })

  it('shows fullscreen controls on entry and hides them after the configured delay', () => {
    const { result } = renderFullscreenUi()

    expect(result.current.isFullscreen).toBe(false)
    expect(result.current.showFullscreenControls).toBe(true)

    dispatchFullscreenChange(document.createElement('section'))

    expect(result.current.isFullscreen).toBe(true)
    expect(result.current.showFullscreenControls).toBe(true)

    act(() => {
      vi.advanceTimersByTime(CONTROLS_HIDE_DELAY_MS)
    })

    expect(result.current.showFullscreenControls).toBe(false)
  })

  it('clears the hide timer and resets fit mode on fullscreen exit', () => {
    const { result } = renderFullscreenUi()

    dispatchFullscreenChange(document.createElement('section'))
    act(() => {
      result.current.toggleVideoFitMode()
    })

    expect(result.current.videoFitMode).toBe('cover')

    dispatchFullscreenChange(null)
    act(() => {
      vi.advanceTimersByTime(CONTROLS_HIDE_DELAY_MS)
    })

    expect(result.current.isFullscreen).toBe(false)
    expect(result.current.showFullscreenControls).toBe(true)
    expect(result.current.videoFitMode).toBe('contain')
  })

  it('schedules subtitle renderer resize after fit mode styles have painted', () => {
    const onResizeSubtitleRenderer = vi.fn()
    const { result } = renderHook(() =>
      useFullscreenPlayerUi({
        onTogglePlay: vi.fn(),
        onResizeSubtitleRenderer,
      }),
    )

    act(() => {
      result.current.toggleVideoFitMode()
    })

    expect(result.current.videoFitMode).toBe('cover')
    expect(onResizeSubtitleRenderer).not.toHaveBeenCalled()

    flushNextAnimationFrame()
    expect(onResizeSubtitleRenderer).not.toHaveBeenCalled()

    flushNextAnimationFrame()
    expect(onResizeSubtitleRenderer).toHaveBeenCalledTimes(1)
  })

  it('turns a non-fullscreen single click into a delayed play toggle', () => {
    const target = document.createElement('div')
    const { result, onTogglePlay } = renderFullscreenUi()

    act(() => {
      result.current.handleVideoInteraction(createMouseInteraction(target))
    })

    expect(onTogglePlay).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(DOUBLE_TAP_THRESHOLD_MS)
    })

    expect(onTogglePlay).toHaveBeenCalledTimes(1)
  })

  it('turns a non-fullscreen double click into one immediate play toggle', () => {
    const target = document.createElement('div')
    const { result, onTogglePlay } = renderFullscreenUi()

    act(() => {
      result.current.handleVideoInteraction(createMouseInteraction(target))
      vi.advanceTimersByTime(DOUBLE_TAP_THRESHOLD_MS - 1)
      result.current.handleVideoInteraction(createMouseInteraction(target))
    })

    expect(onTogglePlay).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(DOUBLE_TAP_THRESHOLD_MS)
    })

    expect(onTogglePlay).toHaveBeenCalledTimes(1)
  })

  it('shows controls for a fullscreen single click without toggling play', () => {
    const target = document.createElement('div')
    const { result, onTogglePlay } = renderFullscreenUi()

    dispatchFullscreenChange(document.createElement('section'))
    act(() => {
      vi.advanceTimersByTime(CONTROLS_HIDE_DELAY_MS)
    })
    expect(result.current.showFullscreenControls).toBe(false)

    act(() => {
      result.current.handleVideoInteraction(createMouseInteraction(target))
      vi.advanceTimersByTime(DOUBLE_TAP_THRESHOLD_MS)
    })

    expect(onTogglePlay).not.toHaveBeenCalled()
    expect(result.current.showFullscreenControls).toBe(true)

    act(() => {
      vi.advanceTimersByTime(CONTROLS_HIDE_DELAY_MS)
    })

    expect(result.current.showFullscreenControls).toBe(false)
  })

  it('toggles fit mode for a fullscreen double click without toggling play', () => {
    const target = document.createElement('div')
    const { result, onTogglePlay } = renderFullscreenUi()

    dispatchFullscreenChange(document.createElement('section'))
    act(() => {
      result.current.handleVideoInteraction(createMouseInteraction(target))
      vi.advanceTimersByTime(DOUBLE_TAP_THRESHOLD_MS - 1)
      result.current.handleVideoInteraction(createMouseInteraction(target))
    })

    expect(onTogglePlay).not.toHaveBeenCalled()
    expect(result.current.videoFitMode).toBe('cover')
    expect(result.current.showFullscreenControls).toBe(true)
  })

  it('ignores interactions inside the controls overlay', () => {
    const overlay = document.createElement('div')
    overlay.dataset.playerControlsOverlay = 'true'
    const target = document.createElement('button')
    overlay.appendChild(target)
    const { result, onTogglePlay } = renderFullscreenUi()

    act(() => {
      result.current.handleVideoInteraction(createMouseInteraction(target))
      vi.advanceTimersByTime(DOUBLE_TAP_THRESHOLD_MS)
    })

    expect(onTogglePlay).not.toHaveBeenCalled()
  })

  it('prevents default touch behavior and treats a non-fullscreen tap as play', () => {
    const target = document.createElement('div')
    const preventDefault = vi.fn()
    const { result, onTogglePlay } = renderFullscreenUi()

    act(() => {
      result.current.handleVideoInteraction(
        createTouchInteraction(target, preventDefault),
      )
      vi.advanceTimersByTime(DOUBLE_TAP_THRESHOLD_MS)
    })

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(onTogglePlay).toHaveBeenCalledTimes(1)
  })

  it('suppresses synthetic mouse clicks from touch events', () => {
    const target = document.createElement('div')
    const { result, onTogglePlay } = renderFullscreenUi()

    act(() => {
      result.current.handleVideoInteraction(createMouseInteraction(target, 0))
      vi.advanceTimersByTime(DOUBLE_TAP_THRESHOLD_MS)
    })

    expect(onTogglePlay).not.toHaveBeenCalled()
  })

  it('resets fullscreen control visibility from mouse movement and mouse leave', () => {
    const { result } = renderFullscreenUi()

    dispatchFullscreenChange(document.createElement('section'))
    act(() => {
      vi.advanceTimersByTime(CONTROLS_HIDE_DELAY_MS)
    })
    expect(result.current.showFullscreenControls).toBe(false)

    act(() => {
      result.current.handleFullscreenMouseMove()
    })
    expect(result.current.showFullscreenControls).toBe(true)

    act(() => {
      vi.advanceTimersByTime(MOUSE_MOVE_THROTTLE_MS)
      result.current.handleContainerMouseLeave()
      vi.advanceTimersByTime(CONTROLS_HIDE_DELAY_MS - 1)
    })
    expect(result.current.showFullscreenControls).toBe(true)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.showFullscreenControls).toBe(false)
  })

  it('cleans up pending timers and animation frames on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const { result, unmount } = renderFullscreenUi()

    dispatchFullscreenChange(document.createElement('section'))
    act(() => {
      result.current.toggleVideoFitMode()
    })

    unmount()

    expect(clearTimeoutSpy).toHaveBeenCalled()
    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(1)
  })
})
