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
}

let fullscreenElement: Element | null = null
let originalFullscreenElementDescriptor: PropertyDescriptor | undefined

function renderFullscreenUi(options: RenderFullscreenUiOptions = {}) {
  const onTogglePlay = options.onTogglePlay ?? vi.fn()

  return {
    ...renderHook(() => useFullscreenPlayerUi({ onTogglePlay })),
    onTogglePlay,
  }
}

function dispatchFullscreenChange(element: Element | null) {
  fullscreenElement = element
  act(() => {
    document.dispatchEvent(new Event('fullscreenchange'))
  })
}

/** The mouse-event members handleVideoInteraction reads. */
type MouseInteraction = Pick<MouseEvent, 'detail' | 'target'>

/** The touch-event members handleVideoInteraction reads. */
type TouchInteraction = Pick<TouchEvent, 'preventDefault' | 'target'> & {
  changedTouches: unknown
}

function createMouseInteraction(target: HTMLElement, detail = 1): MouseEvent {
  const interaction: MouseInteraction = { target, detail }
  // SAFETY: handleVideoInteraction reads only `target`, `detail`, and the
  // absence of `changedTouches`; no other member is reachable on this path.
  return interaction as MouseEvent
}

function createTouchInteraction(
  target: HTMLElement,
  preventDefault = vi.fn(),
): TouchEvent {
  const interaction: TouchInteraction = {
    target,
    changedTouches: [{}],
    preventDefault,
  }
  // SAFETY: the touch branch reads only `target`, the presence of
  // `changedTouches`, and calls `preventDefault`.
  return interaction as TouchEvent
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

  it('cleans up pending timers on unmount', () => {
    const { unmount } = renderFullscreenUi()

    dispatchFullscreenChange(document.createElement('section'))

    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
