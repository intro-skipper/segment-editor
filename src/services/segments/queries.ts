/**
 * TanStack Query hook for fetching media segments.
 * Provides cached access to segments for a specific media item.
 */

import { useQuery } from '@tanstack/react-query'
import { createStandardQueryOptions } from '@/hooks/queries/create-query-hook'
import type { MediaSegmentDto } from '@/types/jellyfin'
import type { SegmentSnapshot } from '@/services/segments/store'
import { readSegments } from '@/services/segments/store'
import { selectValidAuth, useApiStore } from '@/stores'
import { segmentsKeys } from './query-keys'

/**
 * Stable default for an unresolved segments query (`data` while the query is
 * disabled or loading). An inline `= []` default at the call site allocates a
 * new array identity every render, defeating memoization keyed on the data.
 */
export const NO_SEGMENTS: Array<MediaSegmentDto> = []

/**
 * Options for the useSegments hook.
 */
interface UseSegmentsOptions {
  /** Whether the query is enabled */
  enabled?: boolean
}

export const segmentsQueryOptions = {
  list: (itemId: string) =>
    createStandardQueryOptions<SegmentSnapshot>({
      queryKey: segmentsKeys.list(itemId),
      queryFn: ({ signal }) => readSegments(itemId, { signal }),
      cacheDuration: 'SHORT',
      operation: 'Fetch segments',
    }),
} as const

/**
 * Hook to fetch the segment snapshot for a media item.
 * Segments are returned with times converted to seconds for UI display.
 *
 * @param itemId - The media item ID to fetch segments for
 * @param options - Additional query options
 * @returns TanStack Query result with the segment snapshot
 */
export function useSegments(itemId: string, options?: UseSegmentsOptions) {
  const validAuth = useApiStore(selectValidAuth)
  const enabled = options?.enabled ?? true

  return useQuery({
    ...segmentsQueryOptions.list(itemId),
    enabled: validAuth && enabled && !!itemId,
  })
}
