/**
 * Feature: codebase-audit-refactor, Property 12: Exponential Backoff Calculation
 * For any sequence of retry attempts (0, 1, 2, ..., n), the calculated backoff delay
 * SHALL increase exponentially (approximately doubling each attempt) while remaining
 * within the configured bounds [baseDelay, maxDelay]. The delay SHALL include jitter
 * (±25% variation).
 */

import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { calculateBackoffDelay } from '@/lib/retry-utils'

describe('Exponential Backoff Calculation', () => {
  /**
   * Property: Backoff delay is always positive
   * For any attempt number and configuration, the delay SHALL be > 0.
   */
  it('always returns a positive delay', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1000, max: 60000 }),
        (attempt, baseDelay, maxDelay) => {
          const delay = calculateBackoffDelay(attempt, baseDelay, maxDelay)
          return delay > 0
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Backoff delay never exceeds maxDelay
   * For any attempt number, the delay SHALL not exceed maxDelay.
   */
  it('never exceeds maxDelay', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 100, max: 1000 }),
        fc.integer({ min: 1000, max: 60000 }),
        (attempt, baseDelay, maxDelay) => {
          const delay = calculateBackoffDelay(attempt, baseDelay, maxDelay)
          return delay <= maxDelay
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Backoff delay includes jitter within ±25%
   * For any attempt, the delay SHALL be within ±25% of the base exponential value,
   * capped at maxDelay.
   */
  it('delay is within jitter bounds of exponential base', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 100, max: 1000 }),
        fc.integer({ min: 10000, max: 60000 }),
        (attempt, baseDelay, maxDelay) => {
          const delay = calculateBackoffDelay(attempt, baseDelay, maxDelay)

          // Expected exponential value without jitter
          const exponential = baseDelay * (1 << attempt)
          const cappedExponential = Math.min(exponential, maxDelay)

          // Jitter is ±25%, so delay should be within [0.75 * exp, 1.25 * exp]
          const minExpected = cappedExponential * 0.75
          const maxExpected = Math.min(cappedExponential * 1.25, maxDelay)

          return delay >= minExpected && delay <= maxExpected
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Exponential growth pattern
   * For consecutive attempts (before hitting maxDelay), the average delay
   * approximately doubles.
   */
  it('follows exponential growth pattern', () => {
    const baseDelay = 500
    const maxDelay = 100000 // High enough to not cap early attempts

    // Test that attempt n+1 has roughly double the base of attempt n
    for (let attempt = 0; attempt < 5; attempt++) {
      // Run multiple samples to average out jitter
      const samples = 50
      let sumCurrent = 0
      let sumNext = 0

      for (let i = 0; i < samples; i++) {
        sumCurrent += calculateBackoffDelay(attempt, baseDelay, maxDelay)
        sumNext += calculateBackoffDelay(attempt + 1, baseDelay, maxDelay)
      }

      const avgCurrent = sumCurrent / samples
      const avgNext = sumNext / samples

      // The ratio should be approximately 2 (allowing for jitter variance)
      const ratio = avgNext / avgCurrent
      expect(ratio).toBeGreaterThan(1.5)
      expect(ratio).toBeLessThan(2.5)
    }
  })

  /**
   * Property: Default parameters work correctly
   * When called with only attempt number, default baseDelay=500 and maxDelay=8000
   * SHALL be used.
   */
  it('uses correct default parameters', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20 }), (attempt) => {
        const delay = calculateBackoffDelay(attempt)

        // With defaults: baseDelay=500, maxDelay=8000
        // Delay should be positive and <= 8000
        return delay > 0 && delay <= 8000
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: First attempt (attempt=0) is close to baseDelay
   * For attempt 0, the delay SHALL be approximately baseDelay (±25% jitter).
   */
  it('first attempt delay is approximately baseDelay', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 5000 }),
        fc.integer({ min: 10000, max: 60000 }),
        (baseDelay, maxDelay) => {
          const delay = calculateBackoffDelay(0, baseDelay, maxDelay)

          // For attempt 0: exponential = baseDelay * 2^0 = baseDelay
          // With ±25% jitter: [0.75 * baseDelay, 1.25 * baseDelay]
          return delay >= baseDelay * 0.75 && delay <= baseDelay * 1.25
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: High attempts are capped at maxDelay
   * For very high attempt numbers, the delay SHALL be capped at maxDelay.
   */
  it('high attempts are capped at maxDelay', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 20, max: 100 }),
        fc.integer({ min: 100, max: 1000 }),
        fc.integer({ min: 1000, max: 10000 }),
        (attempt, baseDelay, maxDelay) => {
          const delay = calculateBackoffDelay(attempt, baseDelay, maxDelay)

          // For high attempts, exponential would far exceed maxDelay
          // So delay should be capped at maxDelay
          return delay <= maxDelay
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Delay is always a finite number
   * For any valid inputs, the delay SHALL be a finite number.
   */
  it('always returns a finite number', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 60000 }),
        (attempt, baseDelay, maxDelay) => {
          const delay = calculateBackoffDelay(attempt, baseDelay, maxDelay)
          return Number.isFinite(delay)
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Jitter provides variation
   * Multiple calls with the same parameters SHALL produce different results
   * (due to random jitter).
   */
  it('jitter provides variation across calls', () => {
    const attempt = 3
    const baseDelay = 500
    const maxDelay = 8000

    const results = new Set<number>()
    for (let i = 0; i < 20; i++) {
      results.add(calculateBackoffDelay(attempt, baseDelay, maxDelay))
    }

    // With random jitter, we should get multiple different values
    expect(results.size).toBeGreaterThan(1)
  })

  /**
   * Property: Specific attempt values produce expected ranges
   * For specific attempts, verify the delay is in the expected range.
   */
  it('produces expected ranges for specific attempts', () => {
    const baseDelay = 500
    const maxDelay = 8000

    // Attempt 0: base = 500, range = [375, 625]
    // Attempt 1: base = 1000, range = [750, 1250]
    // Attempt 2: base = 2000, range = [1500, 2500]
    // Attempt 3: base = 4000, range = [3000, 5000]
    // Attempt 4: base = 8000, range = [6000, 8000] (capped)

    const testCases = [
      { attempt: 0, minExpected: 375, maxExpected: 625 },
      { attempt: 1, minExpected: 750, maxExpected: 1250 },
      { attempt: 2, minExpected: 1500, maxExpected: 2500 },
      { attempt: 3, minExpected: 3000, maxExpected: 5000 },
      { attempt: 4, minExpected: 6000, maxExpected: 8000 },
    ]

    for (const { attempt, minExpected, maxExpected } of testCases) {
      // Run multiple times to account for jitter
      for (let i = 0; i < 10; i++) {
        const delay = calculateBackoffDelay(attempt, baseDelay, maxDelay)
        expect(delay).toBeGreaterThanOrEqual(minExpected)
        expect(delay).toBeLessThanOrEqual(maxExpected)
      }
    }
  })
})
