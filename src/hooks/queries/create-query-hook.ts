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
import type {
  QueryKey,
  UseQueryOptions,
  UseSuspenseQueryOptions,
} from '@tanstack/react-query'

export type CacheDuration = 'SHORT' | 'MEDIUM' | 'LONG'

interface StandardQueryOptions<TData> {
  queryKey: QueryKey
  queryFn: (context: { signal?: AbortSignal }) => Promise<TData>
  enabled?: boolean
  cacheDuration?: CacheDuration
  operation: string
  select?: (data: TData) => TData
}

type StandardQueryResult<TData> = UseSuspenseQueryOptions<
  TData,
  QueryError,
  TData
> & {
  enabled: boolean
  throwOnError: NonNullable<
    UseQueryOptions<TData, QueryError, TData>['throwOnError']
  >
}

export function createStandardQueryOptions<TData>({
  queryKey,
  queryFn,
  enabled = true,
  cacheDuration = 'MEDIUM',
  operation,
  select,
}: StandardQueryOptions<TData>): StandardQueryResult<TData> {
  return {
    queryKey,
    queryFn: async ({ signal }: { signal?: AbortSignal }) => {
      try {
        return await queryFn({ signal })
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
    throwOnError: (error: unknown) => {
      handleQueryError(error, { queryKey, operation })
      return false
    },
  }
}
