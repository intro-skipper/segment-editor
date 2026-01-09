/**
 * Feature: codebase-audit-refactor, Property: Error Wrapping Consistency
 * For any error value (Error instance, string, object, or unknown), wrapping it
 * with AppError.from() SHALL produce a valid AppError instance with a defined
 * error code and recoverable flag.
 */

import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import type { ErrorCode } from '@/lib/unified-error'
import { AppError, ErrorCodes } from '@/lib/unified-error'

/** All valid error codes */
const VALID_ERROR_CODES = Object.values(ErrorCodes) as Array<ErrorCode>

describe('Error Wrapping Consistency', () => {
  /**
   * Property: AppError.from() always returns an AppError instance
   * For any input value, AppError.from() SHALL return an AppError instance.
   */
  it('always returns an AppError instance for any input', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = AppError.from(input)
        return result instanceof AppError
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: AppError.from() preserves existing AppError instances
   * For any AppError instance, AppError.from() SHALL return the same instance.
   */
  it('preserves existing AppError instances', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_ERROR_CODES),
        fc.string(),
        fc.boolean(),
        (code, message, recoverable) => {
          const original = new AppError(message, code, recoverable)
          const result = AppError.from(original)
          return result === original
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Wrapped errors have valid error codes
   * For any input, the resulting AppError SHALL have a code that is one of
   * the defined ErrorCodes values.
   */
  it('produces valid error codes for any input', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = AppError.from(input)
        return VALID_ERROR_CODES.includes(result.code)
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Wrapped errors have defined recoverable flag
   * For any input, the resulting AppError SHALL have a boolean recoverable flag.
   */
  it('produces defined recoverable flag for any input', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = AppError.from(input)
        return typeof result.recoverable === 'boolean'
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Error instances are wrapped with their message preserved
   * For any Error instance, AppError.from() SHALL preserve the error message.
   */
  it('preserves Error instance messages', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (message) => {
        const error = new Error(message)
        const result = AppError.from(error)
        return result.message.includes(message)
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: String errors are wrapped with the string as message
   * For any string input, AppError.from() SHALL use the string as the message.
   */
  it('uses string input as error message', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (message) => {
        const result = AppError.from(message)
        return result.message.includes(message)
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Context is prepended to error message when provided
   * For any error and context string, the context SHALL be prepended to the message.
   */
  it('prepends context to error message', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (errorMsg, context) => {
          const error = new Error(errorMsg)
          const result = AppError.from(error, context)
          return result.message.startsWith(context)
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: AppError has correct name property
   * For any wrapped error, the name property SHALL be 'AppError'.
   */
  it('has correct name property', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = AppError.from(input)
        return result.name === ('AppError' as string)
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Null and undefined inputs produce valid AppError
   * For null or undefined inputs, AppError.from() SHALL produce a valid AppError.
   */
  it('handles null and undefined inputs', () => {
    const nullResult = AppError.from(null)
    const undefinedResult = AppError.from(undefined)

    expect(nullResult).toBeInstanceOf(AppError)
    expect(undefinedResult).toBeInstanceOf(AppError)
    expect(VALID_ERROR_CODES).toContain(nullResult.code)
    expect(VALID_ERROR_CODES).toContain(undefinedResult.code)
    expect(typeof nullResult.recoverable).toBe('boolean')
    expect(typeof undefinedResult.recoverable).toBe('boolean')
  })

  /**
   * Property: Static factory methods produce valid AppError instances
   * AppError.validation() and AppError.unavailable() SHALL produce valid instances.
   */
  it('static factory methods produce valid instances', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (message) => {
        const validation = AppError.validation(message)
        const unavailable = AppError.unavailable()

        return (
          validation instanceof AppError &&
          unavailable instanceof AppError &&
          validation.code === ErrorCodes.INVALID_INPUT &&
          unavailable.code === ErrorCodes.API_UNAVAILABLE &&
          validation.recoverable === false &&
          unavailable.recoverable === true
        )
      }),
      { numRuns: 100 },
    )
  })
})
