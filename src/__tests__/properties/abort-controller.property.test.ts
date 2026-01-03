/**
 * Feature: codebase-audit-refactor, Property 3: AbortController Cancellation Safety
 * For any async operation that accepts an AbortSignal, when the signal is aborted
 * before or during execution, the operation SHALL return early (with a cancelled/empty
 * result) without throwing unhandled exceptions.
 */

import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { createTimeoutController, delay, withRetry } from '@/lib/retry-utils'
import { isAbortError } from '@/lib/unified-error'

describe('AbortController Cancellation Safety', () => {
  /**
   * Property: Pre-aborted signals cause immediate rejection
   * For any delay duration, if the signal is already aborted,
   * the delay SHALL reject immediately with an AbortError.
   */
  it('delay rejects immediately with pre-aborted signal', () => {
    fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 10000 }), async (delayMs) => {
        const controller = new AbortController()
        controller.abort()

        try {
          await delay(delayMs, controller.signal)
          return false // Should not resolve
        } catch (error) {
          return isAbortError(error)
        }
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Aborted signals during delay cause rejection
   * For any delay, aborting during execution SHALL cause rejection
   * with an AbortError.
   */
  it('delay rejects when aborted during execution', async () => {
    const controller = new AbortController()
    const delayPromise = delay(5000, controller.signal)

    // Abort after a short time
    setTimeout(() => controller.abort(), 10)

    try {
      await delayPromise
      expect.fail('Should have rejected')
    } catch (error) {
      expect(isAbortError(error)).toBe(true)
    }
  })

  /**
   * Property: withRetry respects pre-aborted signals
   * For any operation, if the signal is already aborted,
   * withRetry SHALL throw an AbortError without executing the operation.
   */
  it('withRetry throws immediately with pre-aborted signal', () => {
    fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (maxRetries) => {
        const controller = new AbortController()
        controller.abort()

        let callCount = 0
        const operation = () => {
          callCount++
          return Promise.resolve('success')
        }

        try {
          await withRetry(operation, {
            maxRetries,
            signal: controller.signal,
          })
          return false // Should not succeed
        } catch (error) {
          // Operation should not have been called
          return isAbortError(error) && callCount === 0
        }
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: withRetry stops retrying when aborted
   * For any failing operation, aborting during retries SHALL stop
   * further retry attempts.
   */
  it('withRetry stops retrying when signal is aborted', async () => {
    const controller = new AbortController()
    let callCount = 0

    const failingOperation = () => {
      callCount++
      if (callCount === 2) {
        // Abort after second attempt
        controller.abort()
      }
      return Promise.reject(new Error('Recoverable error'))
    }

    try {
      await withRetry(failingOperation, {
        maxRetries: 5,
        baseDelay: 10,
        signal: controller.signal,
        shouldRetry: () => true,
      })
      expect.fail('Should have thrown')
    } catch (error) {
      expect(isAbortError(error)).toBe(true)
      // Should have stopped after abort, not continued all 5 retries
      expect(callCount).toBeLessThanOrEqual(3)
    }
  })

  /**
   * Property: createTimeoutController creates valid AbortController
   * For any timeout value, createTimeoutController SHALL return
   * a valid AbortController instance.
   */
  it('createTimeoutController returns valid AbortController', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 60000 }), (timeoutMs) => {
        const controller = createTimeoutController(timeoutMs)

        // Should be a valid AbortController
        const isValid =
          controller instanceof AbortController &&
          controller.signal instanceof AbortSignal &&
          typeof controller.abort === 'function'

        // Clean up by aborting
        controller.abort()

        return isValid
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Manual abort clears timeout
   * For any timeout controller, manually aborting SHALL work correctly
   * and the signal SHALL be aborted.
   */
  it('manual abort on timeout controller works correctly', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1000, max: 60000 }), (timeoutMs) => {
        const controller = createTimeoutController(timeoutMs)

        // Manually abort before timeout
        controller.abort(new Error('Manual abort'))

        return controller.signal.aborted === true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Abort errors are correctly identified
   * For any DOMException with name 'AbortError', isAbortError SHALL return true.
   */
  it('isAbortError correctly identifies abort errors', () => {
    // DOMException with AbortError name
    const abortError = new DOMException('Aborted', 'AbortError')
    expect(isAbortError(abortError)).toBe(true)

    // Regular errors should not be identified as abort errors
    const regularError = new Error('Regular error')
    expect(isAbortError(regularError)).toBe(false)

    // Null and undefined should not throw
    expect(isAbortError(null)).toBe(false)
    expect(isAbortError(undefined)).toBe(false)
  })

  /**
   * Property: Successful operations complete normally without abort
   * For any operation that succeeds, withRetry SHALL return the result
   * when no abort occurs.
   */
  it('successful operations complete normally', () => {
    fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), async (expectedResult) => {
        const operation = () => Promise.resolve(expectedResult)

        const result = await withRetry(operation, {
          maxRetries: 3,
        })

        return result === expectedResult
      }),
      { numRuns: 100 },
    )
  })
})
