/**
 * TanStack Query hook for fetching media segments.
 * Provides cached access to segments for a specific media item.
 */

import { useQuery } from '@tanstack/react-query'
import { createQueryKey } from './query-error-handling'
import { createStandardQueryOptions } from './create-query-hook'
import type { MediaSegmentDto } from '@/types/jellyfin'
import { getSegmentsById } from '@/services/segments/api'
import { selectValidAuth, useApiStore } from '@/stores'

/**
 * Type-safe query key factory for segments.
 */
export const segmentsKeys = {
  all: createQueryKey('segments'),
  lists: () => createQueryKey('segments', 'list'),
  list: (itemId: string) => createQueryKey('segments', 'list', itemId),
} as const

/**
 * Options for the useSegments hook.
 */
interface UseSegmentsOptions {
  /** Whether the query is enabled */
  enabled?: boolean
}

/**
 * Hook to fetch all segments for a media item.
 * Segments are returned with times converted to seconds for UI display.
 *
 * @param itemId - The media item ID to fetch segments for
 * @param options - Additional query options
 * @returns TanStack Query result with segments data
 */
export function useSegments(itemId: string, options?: UseSegmentsOptions) {
  const validAuth = useApiStore(selectValidAuth)
  const enabled = options?.enabled ?? true

  return useQuery(
    createStandardQueryOptions<Array<MediaSegmentDto>>({
      queryKey: segmentsKeys.list(itemId),
      queryFn: ({ signal }) => getSegmentsById(itemId, { signal }),
      enabled: validAuth && enabled && !!itemId,
      cacheDuration: 'SHORT',
      operation: 'Fetch segments',
    }),
  )
}
