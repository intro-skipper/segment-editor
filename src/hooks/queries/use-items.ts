/** TanStack Query hooks for fetching Jellyfin media items. */

import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createQueryKey } from './query-error-handling'
import { createStandardQueryOptions } from './create-query-hook'
import type { CacheDuration } from './create-query-hook'
import type { BaseItemDto } from '@/types/jellyfin'
import { filterItemsByName } from '@/lib/utils'
import {
  getAlbums,
  getEpisodes,
  getItemById,
  getItems,
  getSeasons,
  getTracks,
} from '@/services/items/api'
import { useApiStore } from '@/stores/api-store'

// Query Keys
export const itemsKeys = {
  all: createQueryKey('items'),
  list: (parentId: string) => createQueryKey('items', 'list', parentId),
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

// Shared selector
const selectValidConnection = (s: { validConnection: boolean }) =>
  s.validConnection

interface UseEntityOptions {
  enabled?: boolean
}

/** Generic hook factory for simple entity queries */
const useEntityQuery = <T>(
  queryKey: ReturnType<typeof createQueryKey>,
  queryFn: () => Promise<T>,
  ids: string | Array<string>,
  operation: string,
  options?: UseEntityOptions,
  cacheDuration: CacheDuration = 'LONG',
) => {
  const validConnection = useApiStore(selectValidConnection)
  const idsValid = Array.isArray(ids) ? ids.every(Boolean) : !!ids

  return useQuery(
    createStandardQueryOptions<T>({
      queryKey,
      queryFn,
      enabled: validConnection && idsValid && (options?.enabled ?? true),
      cacheDuration,
      operation,
    }),
  )
}

// Hooks
export interface UseItemsOptions {
  parentId: string
  nameFilter?: string
  includeMediaStreams?: boolean
  limit?: number
  startIndex?: number
  enabled?: boolean
}

export function useItems({
  parentId,
  nameFilter,
  includeMediaStreams,
  limit,
  startIndex,
  enabled = true,
}: UseItemsOptions) {
  const validConnection = useApiStore(selectValidConnection)
  const select = useMemo(
    () => (data: Array<BaseItemDto>) => filterItemsByName(data, nameFilter),
    [nameFilter],
  )
  const queryFn = useCallback(
    () => getItems({ parentId, includeMediaStreams, limit, startIndex }),
    [parentId, includeMediaStreams, limit, startIndex],
  )

  return useQuery({
    ...createStandardQueryOptions<Array<BaseItemDto>>({
      queryKey: itemsKeys.list(parentId),
      queryFn,
      enabled: validConnection && enabled && !!parentId,
      cacheDuration: 'MEDIUM',
      operation: 'Fetch items',
    }),
    select,
  })
}

export const useItem = (itemId: string, opts?: UseEntityOptions) =>
  useEntityQuery(
    itemsKeys.detail(itemId),
    () => getItemById(itemId),
    itemId,
    'Fetch item',
    opts,
  )

export const useSeasons = (seriesId: string, opts?: UseEntityOptions) =>
  useEntityQuery(
    seriesKeys.seasons(seriesId),
    () => getSeasons(seriesId),
    seriesId,
    'Fetch seasons',
    opts,
  )

export const useTracks = (albumId: string, opts?: UseEntityOptions) =>
  useEntityQuery(
    albumKeys.tracks(albumId),
    () => getTracks(albumId),
    albumId,
    'Fetch tracks',
    opts,
  )

export const useAlbums = (artistId: string, opts?: UseEntityOptions) =>
  useEntityQuery(
    artistKeys.albums(artistId),
    () => getAlbums(artistId),
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
    () => getEpisodes(seriesId, seasonId),
    [seriesId, seasonId],
    'Fetch episodes',
    opts,
  )
