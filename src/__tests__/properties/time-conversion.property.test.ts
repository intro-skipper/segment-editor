/**
 * Feature: Tick/Second Conversion Round-Trip
 * For any valid tick value, converting to seconds and back to ticks SHALL produce
 * a value equivalent to the original (within floating-point precision).
 * Similarly, for any valid seconds value, converting to ticks and back to seconds
 * SHALL produce an equivalent value.
 */

import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { secondsToTicks, ticksToSeconds } from '@/lib/time-utils'

describe('Tick/Second Conversion Round-Trip', () => {
  /**
   * Property: Ticks round-trip through seconds
   * For any non-negative tick value, converting to seconds and back should
   * produce a value within acceptable precision (1ms = 10,000 ticks).
   */
  it('round-trips ticks through seconds', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
        (ticks) => {
          const seconds = ticksToSeconds(ticks)
          const backToTicks = secondsToTicks(seconds)
          // Allow tolerance of 10,000 ticks (1ms) due to floating-point precision
          return Math.abs(backToTicks - ticks) < 10_000
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Seconds round-trip through ticks
   * For any non-negative seconds value, converting to ticks and back should
   * produce an equivalent value within floating-point precision.
   */
  it('round-trips seconds through ticks', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 86400, noNaN: true, noDefaultInfinity: true }),
        (seconds) => {
          const ticks = secondsToTicks(seconds)
          const backToSeconds = ticksToSeconds(ticks)
          // Allow tolerance of 0.0001 seconds (0.1ms) due to rounding
          return Math.abs(backToSeconds - seconds) < 0.0001
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Zero values are preserved
   * Converting zero in either direction should always return zero.
   */
  it('preserves zero values', () => {
    expect(ticksToSeconds(0)).toBe(0)
    expect(secondsToTicks(0)).toBe(0)
    expect(ticksToSeconds(null)).toBe(0)
    expect(secondsToTicks(null)).toBe(0)
    expect(ticksToSeconds(undefined)).toBe(0)
    expect(secondsToTicks(undefined)).toBe(0)
  })

  /**
   * Property: Conversion maintains ordering
   * For any two tick values where a < b, their converted seconds should maintain a < b.
   */
  it('maintains ordering after conversion', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Math.floor(Number.MAX_SAFE_INTEGER / 2) }),
        fc.integer({ min: 1, max: Math.floor(Number.MAX_SAFE_INTEGER / 2) }),
        (a, delta) => {
          const b = a + delta
          const secondsA = ticksToSeconds(a)
          const secondsB = ticksToSeconds(b)
          return secondsA < secondsB
        },
      ),
      { numRuns: 100 },
    )
  })
})
