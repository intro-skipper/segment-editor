/** Shared retry utilities with exponential backoff. */

import { isAbortError, isRecoverableError } from './unified-error'

export interface RetryOptions {
  maxRetries?: number
  baseDelay?: number
  maxDelay?: number
  signal?: AbortSignal
  shouldRetry?: (error: unknown) => boolean
}

/** Calculates exponential backoff delay with jitter */
export const calculateBackoffDelay = (
  attempt: number,
  baseDelay = 500,
  maxDelay = 8000,
): number => {
  // Exponential: baseDelay * 2^attempt
  const exponential = baseDelay * (1 << attempt) // Bit shift
  // Jitter: ±25%
  const jitter = 1 + 0.25 * (Math.random() * 2 - 1)
  return Math.min(exponential * jitter, maxDelay)
}

/** Delay helper that respects AbortSignal */
export const delay = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      return
    }

    const id = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id)
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })

/** Executes an async function with retry logic */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 500,
    maxDelay = 8000,
    signal,
    shouldRetry = isRecoverableError,
  } = options

  async function attempt(
    retriesLeft: number,
    attemptIndex: number,
  ): Promise<T> {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    try {
      return await fn()
    } catch (error) {
      if (isAbortError(error) || retriesLeft <= 0 || !shouldRetry(error)) {
        throw error
      }

      try {
        await delay(
          calculateBackoffDelay(attemptIndex, baseDelay, maxDelay),
          signal,
        )
      } catch {
        throw new DOMException('Aborted', 'AbortError')
      }

      return attempt(retriesLeft - 1, attemptIndex + 1)
    }
  }

  return attempt(maxRetries, 0)
}

/** Creates an AbortController with automatic timeout */
export function createTimeoutController(timeoutMs = 30000): AbortController {
  const controller = new AbortController()
  const id = setTimeout(
    () => controller.abort(new DOMException('Timeout', 'TimeoutError')),
    timeoutMs,
  )

  // Patch abort to clear timeout and forward reason
  const originalAbort = controller.abort.bind(controller)
  controller.abort = (reason?: unknown) => {
    clearTimeout(id)
    originalAbort(reason)
  }

  return controller
}

/**
 * Executes an async function with retry logic, returning false on failure.
 * Useful for operations where failure should be handled gracefully.
 */
export async function withRetryOrFalse<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T | false> {
  try {
    return await withRetry(fn, options)
  } catch (error) {
    if (isAbortError(error)) return false
    // Log error message only to avoid exposing sensitive request details
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    console.error('Operation failed after retries:', errorMessage)
    return false
  }
}
