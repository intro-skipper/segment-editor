/**
 * TanStack Query error handling utilities.
 * Re-exports AppError as QueryError for semantic clarity in query context.
 */

import type { QueryKey } from '@tanstack/react-query'
import { AppError } from '@/lib/unified-error'
import { calculateBackoffDelay } from '@/lib/retry-utils'
import { API_CONFIG } from '@/lib/constants'

// Re-export for query-specific usage
export { AppError as QueryError }

export const createQueryKey = <T extends ReadonlyArray<unknown>>(
  ...parts: T
): QueryKey => parts as unknown as QueryKey

export const shouldRetryQuery = (
  failureCount: number,
  error: unknown,
): boolean =>
  AppError.from(error).recoverable && failureCount < API_CONFIG.MAX_RETRIES

export const getRetryDelay = (attempt: number): number =>
  calculateBackoffDelay(
    attempt,
    API_CONFIG.BASE_RETRY_DELAY_MS,
    API_CONFIG.MAX_RETRY_DELAY_MS,
  )

export const handleQueryError = (
  error: unknown,
  context?: { queryKey?: QueryKey; operation?: string },
): void => {
  const { code, message, status, recoverable } = AppError.from(error)
  console.error(`[Query] ${context?.operation ?? 'Query'} failed:`, {
    code,
    message,
    status,
    recoverable,
    queryKey: context?.queryKey,
  })
}
