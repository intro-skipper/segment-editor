import { useEffect, useEffectEvent, useReducer, useRef } from 'react'
import type { MouseEvent, TouchEvent } from 'react'

import { PLAYER_CONFIG } from '@/lib/constants'

const {
  CONTROLS_HIDE_DELAY_MS,
  MOUSE_MOVE_THROTTLE_MS,
  DOUBLE_TAP_THRESHOLD_MS,
} = PLAYER_CONFIG

type VideoFitMode = 'contain' | 'cover'

interface FullscreenPlayerUiState {
  isFullscreen: boolean
  showFullscreenControls: boolean
  videoFitMode: VideoFitMode
}

type FullscreenUiAction =
  | { type: 'ENTER_FULLSCREEN' }
  | { type: 'EXIT_FULLSCREEN' }
  | { type: 'SHOW_CONTROLS' }
  | { type: 'HIDE_CONTROLS' }
  | { type: 'TOGGLE_FIT_MODE' }

const initialFullscreenUiState: FullscreenPlayerUiState = {
  isFullscreen: false,
  showFullscreenControls: true,
  videoFitMode: 'contain',
}

function fullscreenUiReducer(
  state: FullscreenPlayerUiState,
  action: FullscreenUiAction,
): FullscreenPlayerUiState {
  switch (action.type) {
    case 'ENTER_FULLSCREEN':
      return {
        ...state,
        isFullscreen: true,
        showFullscreenControls: true,
      }
    case 'EXIT_FULLSCREEN':
      return {
        ...state,
        isFullscreen: false,
        showFullscreenControls: true,
        videoFitMode: 'contain',
      }
    case 'SHOW_CONTROLS':
      return {
        ...state,
        showFullscreenControls: true,
      }
    case 'HIDE_CONTROLS':
      return {
        ...state,
        showFullscreenControls: false,
      }
    case 'TOGGLE_FIT_MODE':
      return {
        ...state,
        videoFitMode: state.videoFitMode === 'contain' ? 'cover' : 'contain',
      }
    default:
      return state
  }
}

interface FullscreenPlayerUiOptions {
  onTogglePlay: () => void
  onResizeSubtitleRenderer: () => void
}

interface FullscreenPlayerUi extends FullscreenPlayerUiState {
  toggleVideoFitMode: () => void
  handleVideoInteraction: (event: MouseEvent | TouchEvent) => void
  handleFullscreenMouseMove: () => void
  handleContainerMouseLeave: () => void
}

export function useFullscreenPlayerUi({
  onTogglePlay,
  onResizeSubtitleRenderer,
}: FullscreenPlayerUiOptions): FullscreenPlayerUi {
  const [fullscreenUiState, dispatchFullscreenUi] = useReducer(
    fullscreenUiReducer,
    initialFullscreenUiState,
  )
  const { isFullscreen, showFullscreenControls, videoFitMode } =
    fullscreenUiState

  const hideControlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const lastInteractionTimeRef = useRef(0)
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastMouseMoveRef = useRef(0)
  const resizeRafRef = useRef<number | null>(null)

  const clearHideControlsTimer = () => {
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current)
      hideControlsTimeoutRef.current = null
    }
  }

  const clearSingleTapTimer = () => {
    if (singleTapTimerRef.current) {
      clearTimeout(singleTapTimerRef.current)
      singleTapTimerRef.current = null
    }
  }

  const clearResizeFrame = () => {
    if (resizeRafRef.current !== null) {
      cancelAnimationFrame(resizeRafRef.current)
      resizeRafRef.current = null
    }
  }

  const scheduleHideControls = () => {
    hideControlsTimeoutRef.current = setTimeout(() => {
      dispatchFullscreenUi({ type: 'HIDE_CONTROLS' })
    }, CONTROLS_HIDE_DELAY_MS)
  }

  const handleFullscreenChange = useEffectEvent(() => {
    const isFs = !!document.fullscreenElement

    if (isFs) {
      dispatchFullscreenUi({ type: 'ENTER_FULLSCREEN' })
      clearHideControlsTimer()
      scheduleHideControls()
    } else {
      dispatchFullscreenUi({ type: 'EXIT_FULLSCREEN' })
      clearHideControlsTimer()
    }
  })

  useEffect(() => {
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  const toggleVideoFitMode = () => {
    dispatchFullscreenUi({ type: 'TOGGLE_FIT_MODE' })
    clearResizeFrame()

    // Schedule resize after browser paints new styles.
    // Double rAF pattern: outer frame waits for style recalc,
    // inner frame ensures layout is complete before measuring.
    resizeRafRef.current = requestAnimationFrame(() => {
      resizeRafRef.current = requestAnimationFrame(() => {
        resizeRafRef.current = null
        onResizeSubtitleRenderer()
      })
    })
  }

  const resetHideControlsTimer = () => {
    clearHideControlsTimer()
    dispatchFullscreenUi({ type: 'SHOW_CONTROLS' })
    if (isFullscreen) {
      scheduleHideControls()
    }
  }

  /**
   * Handler for both mouse clicks and touch taps.
   * Uses the same double-click/tap detection logic for consistency.
   *
   * Behavior:
   * - Outside fullscreen: single tap/click toggles play, double tap/click toggles play
   * - In fullscreen: single tap/click shows OSD, double tap/click toggles fit mode
   */
  const handleVideoInteraction = (event: MouseEvent | TouchEvent) => {
    const target = event.target as HTMLElement | null
    if (target?.closest('[data-player-controls-overlay="true"]')) {
      return
    }

    // For touch events, prevent the subsequent click event from firing.
    if ('changedTouches' in event) {
      event.preventDefault()
    } else {
      // For mouse events, ignore synthetic clicks from touch (detail === 0).
      if (event.detail === 0) return
    }

    const now = Date.now()
    const timeSinceLastInteraction = now - lastInteractionTimeRef.current
    lastInteractionTimeRef.current = now

    clearSingleTapTimer()

    if (timeSinceLastInteraction < DOUBLE_TAP_THRESHOLD_MS) {
      if (isFullscreen) {
        toggleVideoFitMode()
        // Show controls/OSD after changing fit mode so user gets feedback.
        resetHideControlsTimer()
      } else {
        onTogglePlay()
      }
      // Set timestamp just before threshold window so the next tap
      // won't be detected as another double-tap (prevents triple-tap).
      lastInteractionTimeRef.current = now - (DOUBLE_TAP_THRESHOLD_MS + 1)
    } else {
      // Wait to see if this is a single tap/click or first of a double.
      singleTapTimerRef.current = setTimeout(() => {
        singleTapTimerRef.current = null
        if (isFullscreen) {
          // In fullscreen: single tap/click shows controls.
          resetHideControlsTimer()
        } else {
          // Outside fullscreen: toggle play.
          onTogglePlay()
        }
      }, DOUBLE_TAP_THRESHOLD_MS)
    }
  }

  const handleFullscreenMouseMove = () => {
    if (!isFullscreen) return

    const now = Date.now()
    if (
      !showFullscreenControls ||
      now - lastMouseMoveRef.current > MOUSE_MOVE_THROTTLE_MS
    ) {
      lastMouseMoveRef.current = now
      resetHideControlsTimer()
    }
  }

  const handleContainerMouseLeave = () => {
    if (isFullscreen && showFullscreenControls) {
      resetHideControlsTimer()
    }
  }

  useEffect(() => {
    return () => {
      clearHideControlsTimer()
      clearSingleTapTimer()
      clearResizeFrame()
    }
  }, [])

  return {
    isFullscreen,
    showFullscreenControls,
    videoFitMode,
    toggleVideoFitMode,
    handleVideoInteraction,
    handleFullscreenMouseMove,
    handleContainerMouseLeave,
  }
}
