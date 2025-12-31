/**
 * TanStack Query hook for fetching media segments.
 * Provides cached access to segments for a specific media item.
 */

import { useQuery } from '@tanstack/react-query'
import type { MediaSegmentDto } from '@/types/jellyfin'
import { getSegmentsById } from '@/services/segments/api'
import { useApiStore } from '@/stores/api-store'

/**
 * Query key factory for segments.
 */
export const segmentsKeys = {
  all: ['segments'] as const,
  lists: () => [...segmentsKeys.all, 'list'] as const,
  list: (itemId: string) => [...segmentsKeys.lists(), itemId] as const,
}

/**
 * Options for the useSegments hook.
 */
export interface UseSegmentsOptions {
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
 *
 * @example
 * ```tsx
 * const { data: segments, isLoading, refetch } = useSegments(itemId)
 *
 * if (isLoading) return <Spinner />
 *
 * return (
 *   <div>
 *     {segments?.map(segment => (
 *       <SegmentSlider key={segment.Id} segment={segment} />
 *     ))}
 *   </div>
 * )
 * ```
 */
export function useSegments(itemId: string, options?: UseSegmentsOptions) {
  const validConnection = useApiStore((state) => state.validConnection)
  const enabled = options?.enabled ?? true

  return useQuery<Array<MediaSegmentDto>, Error>({
    queryKey: segmentsKeys.list(itemId),
    queryFn: () => getSegmentsById(itemId),
    enabled: validConnection && enabled && !!itemId,
    staleTime: 30 * 1000, // 30 seconds - segments change more frequently
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}
