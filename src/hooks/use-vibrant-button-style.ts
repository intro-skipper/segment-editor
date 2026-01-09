/**
 * Hook for generating button styles from vibrant colors.
 * Eliminates duplicated getButtonStyle pattern across components.
 */

import { useCallback, useMemo } from 'react'
import type { VibrantColors } from './use-vibrant-color'

/** Style object for button elements */
export interface VibrantButtonStyle {
  backgroundColor?: string
  color?: string
  borderColor?: string
}

/** Return type for useVibrantButtonStyle hook */
export interface VibrantButtonStyleResult {
  getButtonStyle: (isActive?: boolean) => VibrantButtonStyle | undefined
  primaryStyle: VibrantButtonStyle | undefined
  secondaryStyle: VibrantButtonStyle | undefined
  ghostStyle: VibrantButtonStyle | undefined
  iconColor: string | undefined
  hasColors: boolean
}

/** Return type for useVibrantTabStyle hook */
export interface VibrantTabStyleResult {
  getTabStyle: (isSelected: boolean) => VibrantButtonStyle | undefined
  hasColors: boolean
}

/** Creates active/selected style */
const activeStyle = (c: VibrantColors): VibrantButtonStyle => ({
  backgroundColor: c.accent,
  color: c.accentText,
  borderColor: 'transparent',
})

/** Creates inactive style with customizable text color */
const inactiveStyle = (
  c: VibrantColors,
  textColor: string,
): VibrantButtonStyle => ({
  backgroundColor: c.background,
  color: textColor,
  borderColor: c.primary,
})

/**
 * Hook that provides memoized button styling functions based on vibrant colors.
 */
export function useVibrantButtonStyle(
  vibrantColors: VibrantColors | null,
): VibrantButtonStyleResult {
  const getButtonStyle = useCallback(
    (isActive = false): VibrantButtonStyle | undefined =>
      vibrantColors
        ? isActive
          ? activeStyle(vibrantColors)
          : inactiveStyle(vibrantColors, vibrantColors.text)
        : undefined,
    [vibrantColors],
  )

  const styles = useMemo(() => {
    if (!vibrantColors)
      return { primary: undefined, secondary: undefined, ghost: undefined }

    return {
      primary: activeStyle(vibrantColors),
      secondary: inactiveStyle(vibrantColors, vibrantColors.text),
      ghost: {
        backgroundColor: 'transparent',
        color: vibrantColors.text,
        borderColor: 'transparent',
      } satisfies VibrantButtonStyle,
    }
  }, [vibrantColors])

  return {
    getButtonStyle,
    primaryStyle: styles.primary,
    secondaryStyle: styles.secondary,
    ghostStyle: styles.ghost,
    iconColor: vibrantColors?.primary,
    hasColors: vibrantColors !== null,
  }
}

/**
 * Gets tab-style button styling (used in SeriesView season tabs).
 * Uses primary color for inactive text instead of regular text color.
 */
export function useVibrantTabStyle(
  vibrantColors: VibrantColors | null,
): VibrantTabStyleResult {
  const getTabStyle = useCallback(
    (isSelected: boolean): VibrantButtonStyle | undefined =>
      vibrantColors
        ? isSelected
          ? activeStyle(vibrantColors)
          : inactiveStyle(vibrantColors, vibrantColors.primary)
        : undefined,
    [vibrantColors],
  )

  return { getTabStyle, hasColors: vibrantColors !== null }
}
