/**
 * TanStack Query hook for fetching Jellyfin media items.
 * Provides cached access to items within collections with filtering support.
 */

import { useQuery } from '@tanstack/react-query'
import type { BaseItemDto } from '@/types/jellyfin'
import type { ApiStore } from '@/stores/api-store'
import { getAllEpisodes, getItemById, getItems } from '@/services/items/api'
import { useApiStore } from '@/stores/api-store'

/**
 * Query key factory for items.
 */
export const itemsKeys = {
  all: ['items'] as const,
  lists: () => [...itemsKeys.all, 'list'] as const,
  list: (parentId: string) => [...itemsKeys.lists(), parentId] as const,
  details: () => [...itemsKeys.all, 'detail'] as const,
  detail: (itemId: string) => [...itemsKeys.details(), itemId] as const,
}

/**
 * Options for the useItems hook.
 */
export interface UseItemsOptions {
  /** Parent collection ID to fetch items from */
  parentId: string
  /** Filter items by name (case-insensitive, client-side) */
  nameFilter?: string
  /** Include media streams in response */
  includeMediaStreams?: boolean
  /** Maximum number of items to return */
  limit?: number
  /** Starting index for pagination */
  startIndex?: number
  /** Whether the query is enabled */
  enabled?: boolean
}

/**
 * Filters items by name (case-insensitive).
 * @param items - Array of items to filter
 * @param filter - Filter string to match against item names
 * @returns Filtered array of items
 */
function filterItemsByName(
  items: Array<BaseItemDto>,
  filter: string | undefined,
): Array<BaseItemDto> {
  if (!filter || filter.trim() === '') {
    return items
  }

  const lowerFilter = filter.toLowerCase()
  return items.filter((item) => item.Name?.toLowerCase().includes(lowerFilter))
}

/**
 * Hook to fetch items from a collection with optional name filtering.
 * Filtering is performed client-side after fetching.
 *
 * @param options - Options for fetching and filtering items
 * @returns TanStack Query result with filtered items data
 *
 * @example
 * ```tsx
 * const { data: items, isLoading } = useItems({
 *   parentId: collectionId,
 *   nameFilter: searchTerm,
 * })
 *
 * return (
 *   <div className="grid">
 *     {items?.map(item => (
 *       <MediaCard key={item.Id} item={item} />
 *     ))}
 *   </div>
 * )
 * ```
 */
export function useItems(options: UseItemsOptions) {
  const { parentId, nameFilter, enabled = true, ...fetchOptions } = options
  const validConnection = useApiStore(
    (state: ApiStore) => state.validConnection,
  )

  return useQuery<Array<BaseItemDto>, Error>({
    queryKey: itemsKeys.list(parentId),
    queryFn: () =>
      getItems({
        parentId,
        ...fetchOptions,
      }),
    enabled: validConnection && enabled && !!parentId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    select: (data: Array<BaseItemDto>) => filterItemsByName(data, nameFilter),
  })
}

/**
 * Hook to fetch a single item by ID.
 *
 * @param itemId - The item ID to fetch
 * @param options - Additional query options
 * @returns TanStack Query result with item data
 *
 * @example
 * ```tsx
 * const { data: item, isLoading } = useItem(itemId)
 *
 * if (isLoading) return <Spinner />
 * if (!item) return <NotFound />
 *
 * return <ItemDetails item={item} />
 * ```
 */
export function useItem(itemId: string, options?: { enabled?: boolean }) {
  const validConnection = useApiStore(
    (state: ApiStore) => state.validConnection,
  )
  const enabled = options?.enabled ?? true

  return useQuery<BaseItemDto | null, Error>({
    queryKey: itemsKeys.detail(itemId),
    queryFn: () => getItemById(itemId),
    enabled: validConnection && enabled && !!itemId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  })
}

/**
 * Hook to fetch all episodes for a series.
 *
 * @param seriesId - The series ID to fetch episodes for
 * @param options - Additional query options
 * @returns TanStack Query result with episodes data
 */
export function useAllEpisodes(
  seriesId: string,
  options?: { enabled?: boolean },
) {
  const validConnection = useApiStore(
    (state: ApiStore) => state.validConnection,
  )
  const enabled = options?.enabled ?? true

  return useQuery<Array<BaseItemDto>, Error>({
    queryKey: [...itemsKeys.all, 'episodes', seriesId],
    queryFn: () => getAllEpisodes(seriesId),
    enabled: validConnection && enabled && !!seriesId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  })
}
