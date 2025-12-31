/**
 * TanStack Query hook for fetching Jellyfin collections.
 * Provides cached access to virtual folders (libraries) from the server.
 */

import { useQuery } from '@tanstack/react-query'
import type { VirtualFolderInfo } from '@/types/jellyfin'
import { getCollections } from '@/services/items/api'
import { useApiStore } from '@/stores/api-store'

/**
 * Query key factory for collections.
 */
export const collectionsKeys = {
  all: ['collections'] as const,
  list: () => [...collectionsKeys.all, 'list'] as const,
}

/**
 * Hook to fetch all collections (virtual folders) from the Jellyfin server.
 * Only fetches when there's a valid connection.
 *
 * @returns TanStack Query result with collections data
 *
 * @example
 * ```tsx
 * const { data: collections, isLoading, error } = useCollections()
 *
 * if (isLoading) return <Spinner />
 * if (error) return <Error message={error.message} />
 *
 * return (
 *   <select>
 *     {collections?.map(c => (
 *       <option key={c.ItemId} value={c.ItemId}>{c.Name}</option>
 *     ))}
 *   </select>
 * )
 * ```
 */
export function useCollections() {
  const validConnection = useApiStore((state) => state.validConnection)

  return useQuery<Array<VirtualFolderInfo>, Error>({
    queryKey: collectionsKeys.list(),
    queryFn: getCollections,
    enabled: validConnection,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
  })
}
