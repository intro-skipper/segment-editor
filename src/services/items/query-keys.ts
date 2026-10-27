import { scopedKey } from '@/hooks/queries/query-identity'
import type { QueryIdentity } from '@/hooks/queries/query-identity'
import type { BaseItemKind } from '@/types/jellyfin'

// Query Keys
export const itemsKeys = {
  list: (
    identity: QueryIdentity,
    parentId: string,
    options?: {
      includeMediaStreams?: boolean
      excludeItemTypes?: Array<BaseItemKind>
      limit?: number
      startIndex?: number
      searchTerm?: string
    },
  ) => scopedKey(identity, 'items', 'list', parentId, options),
  detail: (identity: QueryIdentity, itemId: string) =>
    scopedKey(identity, 'items', 'detail', itemId),
} as const

export const seriesKeys = {
  seasons: (identity: QueryIdentity, seriesId: string) =>
    scopedKey(identity, 'series', 'seasons', seriesId),
  episodes: (identity: QueryIdentity, seriesId: string, seasonId: string) =>
    scopedKey(identity, 'series', 'episodes', seriesId, seasonId),
  adjacentEpisodes: (
    identity: QueryIdentity,
    seriesId: string,
    episodeId: string,
  ) => scopedKey(identity, 'series', 'adjacentEpisodes', seriesId, episodeId),
} as const

export const albumKeys = {
  tracks: (identity: QueryIdentity, albumId: string) =>
    scopedKey(identity, 'album', 'tracks', albumId),
} as const

export const artistKeys = {
  albums: (identity: QueryIdentity, artistId: string) =>
    scopedKey(identity, 'artist', 'albums', artistId),
} as const

/**
 * Type-safe query key factory for collections.
 */
export const collectionsKeys = {
  list: (identity: QueryIdentity) => scopedKey(identity, 'collections', 'list'),
} as const
