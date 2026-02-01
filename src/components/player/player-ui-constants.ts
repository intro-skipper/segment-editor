/**
 * Shared UI constants for player components.
 * Centralizes styling utilities to eliminate duplication across components.
 */

import { cn } from '@/lib/utils'

/** Shared icon sizing class for player controls */
export const ICON_CLASS = 'size-5 sm:size-6' as const

/** Returns inline style for icon color, or undefined if no color provided */
export const getIconStyle = (
  color?: string,
): React.CSSProperties | undefined => (color ? { color } : undefined)

/** Shared button class generator for player control buttons */
export const getButtonClass = (active: boolean, hasColors: boolean): string =>
  cn(
    '!size-12 sm:!size-12 border-2 transition-all duration-200 ease-out',
    active ? 'rounded-[30%] duration-300' : '',
    !hasColors && (active ? 'border-primary' : 'border-border'),
  )

/**
 * Applies alpha transparency to a color string.
 * Supports hex, rgb, rgba, and named colors.
 */
export const applyAlphaToColor = (
  color: string | undefined,
  alpha: number,
): string | undefined => {
  if (!color) return undefined
  // If it's already rgba, replace the alpha
  if (color.startsWith('rgba(')) {
    return color.replace(/,\s*[\d.]+\)$/, `, ${alpha})`)
  }
  // If it's rgb, convert to rgba
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`)
  }
  // If it's a hex color, convert to rgba
  if (color.startsWith('#')) {
    const hex = color.slice(1)
    // Validate hex format: exactly 3, 6, or 8 hex digits (8 = RRGGBBAA)
    if (!/^(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hex)) {
      return undefined
    }
    const r = parseInt(hex.length === 3 ? hex[0] + hex[0] : hex.slice(0, 2), 16)
    const g = parseInt(hex.length === 3 ? hex[1] + hex[1] : hex.slice(2, 4), 16)
    const b = parseInt(hex.length === 3 ? hex[2] + hex[2] : hex.slice(4, 6), 16)
    // For 8-digit hex, we ignore the original alpha and use the provided one
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  // For named colors or other formats, use color-mix (modern browsers)
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`
}
