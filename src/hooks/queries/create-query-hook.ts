/**
 * Factory utilities for creating standardized TanStack Query hooks.
 */

import {
  QueryError,
  getRetryDelay,
  handleQueryError,
  shouldRetryQuery,
} from './query-error-handling'
import { QUERY_GC_TIMES, QUERY_STALE_TIMES } from './query-constants'
import type { QueryKey, UseQueryOptions } from '@tanstack/react-query'

export type CacheDuration = 'SHORT' | 'MEDIUM' | 'LONG'

export interface StandardQueryOptions<TData> {
  queryKey: QueryKey
  queryFn: () => Promise<TData>
  enabled?: boolean
  cacheDuration?: CacheDuration
  operation: string
  select?: (data: TData) => TData
}

export function createStandardQueryOptions<TData>({
  queryKey,
  queryFn,
  enabled = true,
  cacheDuration = 'MEDIUM',
  operation,
  select,
}: StandardQueryOptions<TData>): UseQueryOptions<TData, QueryError, TData> {
  return {
    queryKey,
    queryFn: async () => {
      try {
        return await queryFn()
      } catch (e) {
        throw QueryError.from(e)
      }
    },
    enabled,
    staleTime: QUERY_STALE_TIMES[cacheDuration],
    gcTime: QUERY_GC_TIMES[cacheDuration],
    retry: shouldRetryQuery,
    retryDelay: getRetryDelay,
    select,
    throwOnError: (error) => {
      handleQueryError(error, { queryKey, operation })
      return false
    },
  }
}
