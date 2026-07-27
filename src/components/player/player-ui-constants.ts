/**
 * Shared UI constants for player components.
 * Centralizes styling utilities to eliminate duplication across components.
 */

import { cn } from '@/lib/utils'

/** Shared icon sizing class for player controls */
export const ICON_CLASS = 'size-5 sm:size-6' as const

/** Shared button class generator for player control buttons */
export const getButtonClass = (active: boolean): string =>
  cn(
    '!size-12 sm:!size-12 border-2 transition-[border-radius,border-color,background-color,color,opacity] duration-200 ease-out',
    active
      ? 'rounded-[30%] duration-300 border-primary bg-primary/10 text-primary hover:bg-primary/15'
      : 'border-border',
  )
