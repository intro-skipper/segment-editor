/**
 * TanStack Query hook for fetching Jellyfin collections.
 * Provides cached access to virtual folders (libraries) from the server.
 */

import { useQuery } from '@tanstack/react-query'
import { createQueryKey } from './query-error-handling'
import { createStandardQueryOptions } from './create-query-hook'
import type { VirtualFolderInfo } from '@/types/jellyfin'
import { getCollections } from '@/services/items/api'
import { selectValidAuth, useApiStore } from '@/stores'

/**
 * Type-safe query key factory for collections.
 */
const collectionsKeys = {
  all: createQueryKey('collections'),
  list: () => createQueryKey('collections', 'list'),
} as const

/**
 * Hook to fetch all collections (virtual folders) from the Jellyfin server.
 * Only fetches when there's a valid authenticated connection.
 *
 * @returns TanStack Query result with collections data
 */
export function useCollections() {
  const validAuth = useApiStore(selectValidAuth)

  return useQuery(
    createStandardQueryOptions<Array<VirtualFolderInfo>>({
      queryKey: collectionsKeys.list(),
      queryFn: ({ signal }) => getCollections({ signal }),
      enabled: validAuth,
      cacheDuration: 'LONG',
      operation: 'Fetch collections',
    }),
  )
}
