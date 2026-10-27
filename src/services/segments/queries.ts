/**
 * TanStack Query hook for fetching media segments.
 * Provides cached access to segments for a specific media item.
 */

import { createStandardQueryOptions } from '@/hooks/queries/create-query-hook'
import { useServerQuery } from '@/hooks/queries/query-identity'
import type { QueryIdentity } from '@/hooks/queries/query-identity'
import type { Segment } from '@/types/segment'
import type { SegmentSnapshot } from '@/services/segments/store'
import { readSegments } from '@/services/segments/store'
import { segmentsKeys } from './query-keys'

/**
 * Stable stand-in for `data.segments` while the query is disabled or loading.
 * An inline `= []` would allocate a new array every render, defeating
 * memoization keyed on it.
 */
export const NO_SEGMENTS: Array<Segment> = []

/**
 * Options for the useSegments hook.
 */
interface UseSegmentsOptions {
  /** Whether the query is enabled */
  enabled?: boolean
}

export const segmentsQueryOptions = {
  list: (identity: QueryIdentity, itemId: string) =>
    createStandardQueryOptions<SegmentSnapshot>({
      queryKey: segmentsKeys.list(identity, itemId),
      queryFn: ({ signal }) => readSegments(itemId, { signal }),
      cacheDuration: 'SHORT',
      operation: 'Fetch segments',
    }),
} as const

/**
 * Hook to fetch the segment snapshot for a media item.
 *
 * @param itemId - The media item ID to fetch segments for
 * @param options - Additional query options
 * @returns TanStack Query result with the segment snapshot
 */
export function useSegments(itemId: string, options?: UseSegmentsOptions) {
  return useServerQuery(
    (identity) => segmentsQueryOptions.list(identity, itemId),
    (options?.enabled ?? true) && !!itemId,
  )
}
