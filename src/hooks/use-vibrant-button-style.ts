import type { VibrantColors } from './use-vibrant-color'

interface VibrantButtonStyle {
  backgroundColor?: string
  color?: string
  borderColor?: string
}

interface VibrantButtonStyleResult {
  getButtonStyle: (isActive?: boolean) => VibrantButtonStyle | undefined
  primaryStyle: VibrantButtonStyle | undefined
  secondaryStyle: VibrantButtonStyle | undefined
  ghostStyle: VibrantButtonStyle | undefined
  iconColor: string | undefined
  hasColors: boolean
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

export function useVibrantButtonStyle(
  vibrantColors: VibrantColors | null,
): VibrantButtonStyleResult {
  const getButtonStyle = (isActive = false): VibrantButtonStyle | undefined =>
    vibrantColors
      ? isActive
        ? activeStyle(vibrantColors)
        : inactiveStyle(vibrantColors, vibrantColors.text)
      : undefined

  const styles = (() => {
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
  })()

  return {
    getButtonStyle,
    primaryStyle: styles.primary,
    secondaryStyle: styles.secondary,
    ghostStyle: styles.ghost,
    iconColor: vibrantColors?.primary,
    hasColors: vibrantColors !== null,
  }
}

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
