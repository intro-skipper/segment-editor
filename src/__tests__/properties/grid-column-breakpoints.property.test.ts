/**
 * Feature: codebase-audit-refactor, Property 13: Grid Column Breakpoint Calculation
 * For any viewport width, the grid column count SHALL match the expected breakpoint:
 * 2 columns for width < 640px, 3 for 640-767px, 4 for 768-1023px, 5 for 1024-1279px,
 * and 6 for width >= 1280px.
 */

import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { getGridColumns } from '@/lib/responsive-utils'
import { COLUMN_BREAKPOINTS, VIEWPORT_BREAKPOINTS } from '@/lib/constants'

describe('Grid Column Breakpoint Calculation', () => {
  /**
   * Property: Mobile widths (< 640px) return 2 columns
   * For any width less than 640px, getGridColumns SHALL return 2.
   */
  it('returns 2 columns for mobile widths (< 640px)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: VIEWPORT_BREAKPOINTS.sm - 1 }),
        (width) => {
          return getGridColumns(width) === COLUMN_BREAKPOINTS.default
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Small widths (640-767px) return 3 columns
   * For any width in [640, 768), getGridColumns SHALL return 3.
   */
  it('returns 3 columns for small widths (640-767px)', () => {
    fc.assert(
      fc.property(
        fc.integer({
          min: VIEWPORT_BREAKPOINTS.sm,
          max: VIEWPORT_BREAKPOINTS.md - 1,
        }),
        (width) => {
          return getGridColumns(width) === COLUMN_BREAKPOINTS.sm
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Medium widths (768-1023px) return 4 columns
   * For any width in [768, 1024), getGridColumns SHALL return 4.
   */
  it('returns 4 columns for medium widths (768-1023px)', () => {
    fc.assert(
      fc.property(
        fc.integer({
          min: VIEWPORT_BREAKPOINTS.md,
          max: VIEWPORT_BREAKPOINTS.lg - 1,
        }),
        (width) => {
          return getGridColumns(width) === COLUMN_BREAKPOINTS.md
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Large widths (1024-1279px) return 5 columns
   * For any width in [1024, 1280), getGridColumns SHALL return 5.
   */
  it('returns 5 columns for large widths (1024-1279px)', () => {
    fc.assert(
      fc.property(
        fc.integer({
          min: VIEWPORT_BREAKPOINTS.lg,
          max: VIEWPORT_BREAKPOINTS.xl - 1,
        }),
        (width) => {
          return getGridColumns(width) === COLUMN_BREAKPOINTS.lg
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Extra large widths (>= 1280px) return 6 columns
   * For any width >= 1280px, getGridColumns SHALL return 6.
   */
  it('returns 6 columns for extra large widths (>= 1280px)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: VIEWPORT_BREAKPOINTS.xl, max: 10000 }),
        (width) => {
          return getGridColumns(width) === COLUMN_BREAKPOINTS.xl
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Column count is always within valid range [2, 6]
   * For any positive width, getGridColumns SHALL return a value between 2 and 6.
   */
  it('always returns a column count between 2 and 6', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10000 }), (width) => {
        const columns = getGridColumns(width)
        return columns >= 2 && columns <= 6
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Column count is monotonically non-decreasing with width
   * For any two widths where w1 <= w2, getGridColumns(w1) <= getGridColumns(w2).
   */
  it('column count is monotonically non-decreasing with width', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 0, max: 5000 }),
        (w1, w2) => {
          const [smaller, larger] = w1 <= w2 ? [w1, w2] : [w2, w1]
          return getGridColumns(smaller) <= getGridColumns(larger)
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Exact breakpoint boundaries return correct columns
   * At exact breakpoint values, getGridColumns SHALL return the higher column count.
   */
  it('returns correct columns at exact breakpoint boundaries', () => {
    // At exactly 640px, should return 3 (sm breakpoint)
    expect(getGridColumns(VIEWPORT_BREAKPOINTS.sm)).toBe(COLUMN_BREAKPOINTS.sm)

    // At exactly 768px, should return 4 (md breakpoint)
    expect(getGridColumns(VIEWPORT_BREAKPOINTS.md)).toBe(COLUMN_BREAKPOINTS.md)

    // At exactly 1024px, should return 5 (lg breakpoint)
    expect(getGridColumns(VIEWPORT_BREAKPOINTS.lg)).toBe(COLUMN_BREAKPOINTS.lg)

    // At exactly 1280px, should return 6 (xl breakpoint)
    expect(getGridColumns(VIEWPORT_BREAKPOINTS.xl)).toBe(COLUMN_BREAKPOINTS.xl)
  })

  /**
   * Property: One pixel below breakpoint returns lower column count
   * At breakpoint - 1, getGridColumns SHALL return the lower column count.
   */
  it('returns lower column count one pixel below breakpoint', () => {
    // At 639px (sm - 1), should return 2 (default)
    expect(getGridColumns(VIEWPORT_BREAKPOINTS.sm - 1)).toBe(
      COLUMN_BREAKPOINTS.default,
    )

    // At 767px (md - 1), should return 3 (sm)
    expect(getGridColumns(VIEWPORT_BREAKPOINTS.md - 1)).toBe(
      COLUMN_BREAKPOINTS.sm,
    )

    // At 1023px (lg - 1), should return 4 (md)
    expect(getGridColumns(VIEWPORT_BREAKPOINTS.lg - 1)).toBe(
      COLUMN_BREAKPOINTS.md,
    )

    // At 1279px (xl - 1), should return 5 (lg)
    expect(getGridColumns(VIEWPORT_BREAKPOINTS.xl - 1)).toBe(
      COLUMN_BREAKPOINTS.lg,
    )
  })

  /**
   * Property: Zero and negative widths return default columns
   * For width <= 0, getGridColumns SHALL return the default column count (2).
   */
  it('returns default columns for zero width', () => {
    expect(getGridColumns(0)).toBe(COLUMN_BREAKPOINTS.default)
  })

  /**
   * Property: Very large widths return maximum columns
   * For extremely large widths, getGridColumns SHALL return 6 (xl).
   */
  it('returns 6 columns for very large widths', () => {
    fc.assert(
      fc.property(fc.integer({ min: 5000, max: 100000 }), (width) => {
        return getGridColumns(width) === COLUMN_BREAKPOINTS.xl
      }),
      { numRuns: 100 },
    )
  })
})
