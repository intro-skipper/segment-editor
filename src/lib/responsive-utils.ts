/**
 * Responsive layout utilities.
 * Provides functions for calculating responsive grid layouts.
 *
 * Breakpoint alignment:
 * - All breakpoints align with Tailwind CSS defaults
 * - sm: 640px, md: 768px, lg: 1024px, xl: 1280px
 * - Use VIEWPORT_BREAKPOINTS constants for programmatic access
 *
 * Touch target compliance (WCAG 2.5.5):
 * - Minimum touch target size: 44x44px
 * - CSS handles touch expansion via @media (pointer: coarse)
 */

import { COLUMN_BREAKPOINTS, VIEWPORT_BREAKPOINTS } from '@/lib/constants'

/**
 * Calculates the number of grid columns based on viewport width.
 *
 * Breakpoint mapping:
 * - width < 640px: 2 columns (mobile)
 * - width >= 640px && < 768px: 3 columns (small)
 * - width >= 768px && < 1024px: 4 columns (medium)
 * - width >= 1024px && < 1280px: 5 columns (large)
 * - width >= 1280px: 6 columns (extra large)
 *
 * @param width - The viewport width in pixels
 * @returns The number of columns for the grid
 */
export function getGridColumns(width: number): number {
  if (width >= VIEWPORT_BREAKPOINTS.xl) return COLUMN_BREAKPOINTS.xl
  if (width >= VIEWPORT_BREAKPOINTS.lg) return COLUMN_BREAKPOINTS.lg
  if (width >= VIEWPORT_BREAKPOINTS.md) return COLUMN_BREAKPOINTS.md
  if (width >= VIEWPORT_BREAKPOINTS.sm) return COLUMN_BREAKPOINTS.sm
  return COLUMN_BREAKPOINTS.default
}
