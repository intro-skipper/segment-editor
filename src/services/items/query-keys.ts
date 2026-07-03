import { createQueryKey } from '@/hooks/queries/query-error-handling'
import type { BaseItemKind } from '@/types/jellyfin'

// Query Keys
export const itemsKeys = {
  list: (
    parentId: string,
    options?: {
      includeMediaStreams?: boolean
      excludeItemTypes?: Array<BaseItemKind>
      limit?: number
      startIndex?: number
      searchTerm?: string
    },
  ) => createQueryKey('items', 'list', parentId, options),
  detail: (itemId: string) => createQueryKey('items', 'detail', itemId),
} as const

export const seriesKeys = {
  seasons: (seriesId: string) => createQueryKey('series', 'seasons', seriesId),
  episodes: (seriesId: string, seasonId: string) =>
    createQueryKey('series', 'episodes', seriesId, seasonId),
} as const

export const albumKeys = {
  tracks: (albumId: string) => createQueryKey('album', 'tracks', albumId),
} as const

export const artistKeys = {
  albums: (artistId: string) => createQueryKey('artist', 'albums', artistId),
} as const

/**
 * Type-safe query key factory for collections.
 */
export const collectionsKeys = {
  list: () => createQueryKey('collections', 'list'),
} as const
