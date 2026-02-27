/**
 * Keyboard navigation utilities.
 * Consolidates duplicated keyboard handling patterns from SegmentSlider and PlayerScrubber.
 */

import { SEGMENT_CONFIG } from './constants'

const { KEYBOARD_STEP_FINE, KEYBOARD_STEP_COARSE } = SEGMENT_CONFIG

interface RangeKeyboardConfig {
  min: number
  max: number
  value: number
  /** Gap to maintain from the opposite bound */
  gap?: number
  /** Fine step size (default: KEYBOARD_STEP_FINE) */
  stepFine?: number
  /** Coarse step size when shift is held (default: KEYBOARD_STEP_COARSE) */
  stepCoarse?: number
}

interface RangeKeyboardResult {
  handled: boolean
  newValue: number
}

/**
 * Handles keyboard navigation for range inputs (sliders).
 * Supports Arrow keys, Home/End with consistent step sizes.
 *
 * @param key - The keyboard key pressed
 * @param shiftKey - Whether shift is held (for coarse steps)
 * @param config - Range configuration
 * @returns Result with handled flag and new value
 */
export function handleRangeKeyboard(
  key: string,
  shiftKey: boolean,
  config: RangeKeyboardConfig,
): RangeKeyboardResult {
  const {
    min,
    max,
    value,
    gap = 0,
    stepFine = KEYBOARD_STEP_FINE,
    stepCoarse = KEYBOARD_STEP_COARSE,
  } = config
  const step = shiftKey ? stepCoarse : stepFine
  const effectiveMax = max - gap

  let newValue = value
  let handled = true

  switch (key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      newValue = Math.max(min, value - step)
      break
    case 'ArrowRight':
    case 'ArrowUp':
      newValue = Math.min(effectiveMax, value + step)
      break
    case 'Home':
      newValue = min
      break
    case 'End':
      newValue = effectiveMax
      break
    default:
      handled = false
  }

  return { handled, newValue }
}

/**
 * Handles keyboard navigation for start handle of a range slider.
 */
export function handleStartHandleKeyboard(
  key: string,
  shiftKey: boolean,
  start: number,
  end: number,
  minGap: number,
): RangeKeyboardResult {
  return handleRangeKeyboard(key, shiftKey, {
    min: 0,
    max: end,
    value: start,
    gap: minGap,
  })
}

/**
 * Handles keyboard navigation for end handle of a range slider.
 */
export function handleEndHandleKeyboard(
  key: string,
  shiftKey: boolean,
  start: number,
  end: number,
  maxValue: number,
  minGap: number,
): RangeKeyboardResult {
  const result = handleRangeKeyboard(key, shiftKey, {
    min: start,
    max: maxValue,
    value: end,
    gap: minGap,
  })

  // For end handle, Home goes to start + gap, End goes to max
  if (key === 'Home') {
    result.newValue = start + minGap
  } else if (key === 'End') {
    result.newValue = maxValue
  }

  return result
}
