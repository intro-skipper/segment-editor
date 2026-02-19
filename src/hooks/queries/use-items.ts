/** TanStack Query hooks for fetching Jellyfin media items. */

import { useCallback, useMemo } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createQueryKey } from './query-error-handling'
import { createStandardQueryOptions } from './create-query-hook'
import type { CacheDuration } from './create-query-hook'
import type { PagedItemsResult } from '@/services/items/api'
import type { BaseItemKind } from '@/types/jellyfin'
import {
  getAlbums,
  getEpisodes,
  getItemById,
  getItems,
  getSeasons,
  getTracks,
} from '@/services/items/api'
import { selectValidAuth, useApiStore } from '@/stores'

// Query Keys
export const itemsKeys = {
  all: createQueryKey('items'),
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
  episodes: (seriesId: string) => createQueryKey('items', 'episodes', seriesId),
} as const

export const seriesKeys = {
  all: createQueryKey('series'),
  seasons: (seriesId: string) => createQueryKey('series', 'seasons', seriesId),
  episodes: (seriesId: string, seasonId: string) =>
    createQueryKey('series', 'episodes', seriesId, seasonId),
} as const

export const albumKeys = {
  all: createQueryKey('album'),
  tracks: (albumId: string) => createQueryKey('album', 'tracks', albumId),
} as const

export const artistKeys = {
  all: createQueryKey('artist'),
  albums: (artistId: string) => createQueryKey('artist', 'albums', artistId),
} as const

interface UseEntityOptions {
  enabled?: boolean
}

/** Generic hook factory for simple entity queries */
const useEntityQuery = <T>(
  queryKey: ReturnType<typeof createQueryKey>,
  queryFn: (context: { signal?: AbortSignal }) => Promise<T>,
  ids: string | Array<string>,
  operation: string,
  options?: UseEntityOptions,
  cacheDuration: CacheDuration = 'LONG',
) => {
  const validAuth = useApiStore(selectValidAuth)
  const idsValid = Array.isArray(ids) ? ids.every(Boolean) : !!ids

  return useQuery(
    createStandardQueryOptions<T>({
      queryKey,
      queryFn,
      enabled: validAuth && idsValid && (options?.enabled ?? true),
      cacheDuration,
      operation,
    }),
  )
}

// Hooks
interface UseItemsOptions {
  parentId: string
  nameFilter?: string
  includeMediaStreams?: boolean
  excludeItemTypes?: Array<BaseItemKind>
  limit?: number
  startIndex?: number
  enabled?: boolean
}

export function useItems({
  parentId,
  nameFilter,
  includeMediaStreams = false,
  excludeItemTypes,
  limit,
  startIndex,
  enabled = true,
}: UseItemsOptions) {
  const validAuth = useApiStore(selectValidAuth)
  const trimmedFilter = useMemo(() => nameFilter?.trim(), [nameFilter])

  const queryFn = useCallback(
    ({ signal }: { signal?: AbortSignal }) =>
      getItems(
        {
          parentId,
          searchTerm: trimmedFilter,
          includeMediaStreams,
          excludeItemTypes,
          limit,
          startIndex,
        },
        { signal },
      ),
    [
      parentId,
      trimmedFilter,
      includeMediaStreams,
      excludeItemTypes,
      limit,
      startIndex,
    ],
  )

  return useQuery({
    ...createStandardQueryOptions<PagedItemsResult>({
      queryKey: itemsKeys.list(parentId, {
        includeMediaStreams,
        excludeItemTypes,
        limit,
        startIndex,
        searchTerm: trimmedFilter,
      }),
      queryFn,
      enabled: validAuth && enabled && !!parentId,
      cacheDuration: 'MEDIUM',
      operation: 'Fetch items',
    }),
    // Keep showing previous data during transitions to prevent flicker
    placeholderData: keepPreviousData,
  })
}

export const useItem = (itemId: string, opts?: UseEntityOptions) =>
  useEntityQuery(
    itemsKeys.detail(itemId),
    (context) => getItemById(itemId, context),
    itemId,
    'Fetch item',
    opts,
  )

export const useSeasons = (seriesId: string, opts?: UseEntityOptions) =>
  useEntityQuery(
    seriesKeys.seasons(seriesId),
    (context) => getSeasons(seriesId, context),
    seriesId,
    'Fetch seasons',
    opts,
  )

export const useTracks = (albumId: string, opts?: UseEntityOptions) =>
  useEntityQuery(
    albumKeys.tracks(albumId),
    (context) => getTracks(albumId, undefined, context),
    albumId,
    'Fetch tracks',
    opts,
  )

export const useAlbums = (artistId: string, opts?: UseEntityOptions) =>
  useEntityQuery(
    artistKeys.albums(artistId),
    (context) => getAlbums(artistId, context),
    artistId,
    'Fetch albums',
    opts,
  )

export const useEpisodes = (
  seriesId: string,
  seasonId: string,
  opts?: UseEntityOptions,
) =>
  useEntityQuery(
    seriesKeys.episodes(seriesId, seasonId),
    (context) => getEpisodes(seriesId, seasonId, undefined, context),
    [seriesId, seasonId],
    'Fetch episodes',
    opts,
  )
