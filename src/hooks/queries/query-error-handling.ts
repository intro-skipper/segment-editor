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
): QueryKey => parts

export const shouldRetryQuery = (
  failureCount: number,
  cause: unknown,
): boolean =>
  AppError.from(cause).recoverable && failureCount < API_CONFIG.MAX_RETRIES

export const getRetryDelay = (attempt: number): number =>
  calculateBackoffDelay(
    attempt,
    API_CONFIG.BASE_RETRY_DELAY_MS,
    API_CONFIG.MAX_RETRY_DELAY_MS,
  )

export const handleQueryError = (
  cause: unknown,
  context?: { queryKey?: QueryKey; operation?: string },
): void => {
  const { code, message, status, recoverable } = AppError.from(cause)
  console.error(`[Query] ${context?.operation ?? 'Query'} failed:`, {
    code,
    message,
    status,
    recoverable,
    queryKey: context?.queryKey,
  })
}
