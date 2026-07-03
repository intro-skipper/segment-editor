import type { VibrantColors } from './use-vibrant-color'

interface VibrantButtonStyle {
  backgroundColor?: string
  color?: string
  borderColor?: string
}

interface VibrantTabStyleResult {
  getTabStyle: (isSelected: boolean) => VibrantButtonStyle | undefined
  hasColors: boolean
}

const activeStyle = (c: VibrantColors): VibrantButtonStyle => ({
  backgroundColor: c.accent,
  color: c.accentText,
  borderColor: 'transparent',
})

const inactiveStyle = (
  c: VibrantColors,
  textColor: string,
): VibrantButtonStyle => ({
  // Use semi-transparent primary color instead of background to ensure visibility
  backgroundColor: `${c.primary}30`, // ~19% opacity
  color: textColor,
  borderColor: c.primary,
})

export function useVibrantTabStyle(
  vibrantColors: VibrantColors | null,
): VibrantTabStyleResult {
  const getTabStyle = (isSelected: boolean): VibrantButtonStyle | undefined =>
    vibrantColors
      ? isSelected
        ? activeStyle(vibrantColors)
        : inactiveStyle(vibrantColors, vibrantColors.primary)
      : undefined

  return { getTabStyle, hasColors: vibrantColors !== null }
}
