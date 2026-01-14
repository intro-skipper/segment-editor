/**
 * Feature: codebase-audit-refactor, Property: Time String Parsing Safety
 * For any input value (string, number, null, undefined),
 * parseTimeString SHALL return a finite non-negative number without
 * throwing an exception.
 */

import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { parseTimeString } from '@/lib/time-utils'

/** Arbitrary for valid parseTimeString inputs (string | number | null | undefined) */
const validInputArb = fc.oneof(
  fc.string(),
  fc.double(),
  fc.integer(),
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(NaN),
  fc.constant(Infinity),
  fc.constant(-Infinity),
)

describe('Time String Parsing Safety', () => {
  /**
   * Property: parseTimeString never throws for valid input types
   * For any valid input (string, number, null, undefined),
   * parseTimeString SHALL not throw an exception.
   */
  it('never throws for valid input types', () => {
    fc.assert(
      fc.property(validInputArb, (input) => {
        try {
          parseTimeString(input)
          return true
        } catch {
          return false
        }
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: parseTimeString always returns a finite number
   * For any valid input, the result SHALL be a finite number (not NaN or Infinity).
   */
  it('always returns a finite number', () => {
    fc.assert(
      fc.property(validInputArb, (input) => {
        const result = parseTimeString(input)
        return Number.isFinite(result)
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: parseTimeString always returns a non-negative number
   * For any valid input, the result SHALL be >= 0.
   */
  it('always returns a non-negative number', () => {
    fc.assert(
      fc.property(validInputArb, (input) => {
        const result = parseTimeString(input)
        return result >= 0
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: String inputs never cause exceptions
   * For any string input (including malformed, empty, special characters),
   * parseTimeString SHALL not throw.
   */
  it('handles any string input without throwing', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        try {
          const result = parseTimeString(input)
          return Number.isFinite(result) && result >= 0
        } catch {
          return false
        }
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Number inputs never cause exceptions
   * For any number input (including NaN, Infinity, negative),
   * parseTimeString SHALL not throw and return a valid result.
   */
  it('handles any number input without throwing', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.double(),
          fc.integer(),
          fc.constant(NaN),
          fc.constant(Infinity),
          fc.constant(-Infinity),
        ),
        (input) => {
          try {
            const result = parseTimeString(input)
            return Number.isFinite(result) && result >= 0
          } catch {
            return false
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Null and undefined inputs return 0
   * For null or undefined input, parseTimeString SHALL return 0.
   */
  it('returns 0 for null and undefined', () => {
    expect(parseTimeString(null)).toBe(0)
    expect(parseTimeString(undefined)).toBe(0)
  })

  /**
   * Property: Empty string returns 0
   * For empty string input, parseTimeString SHALL return 0.
   */
  it('returns 0 for empty string', () => {
    expect(parseTimeString('')).toBe(0)
    expect(parseTimeString('   ')).toBe(0)
  })

  /**
   * Property: Valid time formats are parsed correctly
   * For valid time format strings, parseTimeString SHALL return
   * the correct number of seconds.
   */
  it('parses valid time formats correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        fc.integer({ min: 0, max: 59 }),
        (hours, minutes, seconds) => {
          const timeString = `${hours}:${minutes}:${seconds}`
          const result = parseTimeString(timeString)
          const expected = hours * 3600 + minutes * 60 + seconds
          return Math.abs(result - expected) < 0.001
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Minutes:seconds format is parsed correctly
   * For MM:SS format strings, parseTimeString SHALL return correct seconds.
   */
  it('parses MM:SS format correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 59 }),
        fc.integer({ min: 0, max: 59 }),
        (minutes, seconds) => {
          const timeString = `${minutes}:${seconds}`
          const result = parseTimeString(timeString)
          const expected = minutes * 60 + seconds
          return Math.abs(result - expected) < 0.001
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Numeric strings are parsed as seconds
   * For numeric string input, parseTimeString SHALL parse it as seconds.
   */
  it('parses numeric strings as seconds', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 86400 }), (seconds) => {
        const result = parseTimeString(String(seconds))
        return Math.abs(result - seconds) < 0.001
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Negative number inputs are clamped to 0
   * For negative number inputs, parseTimeString SHALL return 0.
   */
  it('clamps negative numbers to 0', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: -1 }), (negativeNum) => {
        const result = parseTimeString(negativeNum)
        return result === 0
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Result is always a number type
   * For any valid input, the result SHALL be of type 'number'.
   */
  it('always returns number type', () => {
    fc.assert(
      fc.property(validInputArb, (input) => {
        const result = parseTimeString(input)
        return typeof result === 'number'
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Special characters in strings don't cause crashes
   * For strings with special characters, parseTimeString SHALL not throw.
   */
  it('handles special characters without crashing', () => {
    const specialStrings = [
      '!@#$%^&*()',
      '\n\t\r',
      '🎬🎥',
      '<script>alert("xss")</script>',
      'null',
      'undefined',
      'NaN',
      'Infinity',
      '-Infinity',
      '1e308',
      '1e-308',
    ]

    for (const str of specialStrings) {
      const result = parseTimeString(str)
      expect(Number.isFinite(result)).toBe(true)
      expect(result).toBeGreaterThanOrEqual(0)
    }
  })
})
