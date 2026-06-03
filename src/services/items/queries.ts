import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createStandardQueryOptions } from '@/hooks/queries/create-query-hook'
import type { PagedItemsResult } from '@/services/items/api'
import type { BaseItemKind, VirtualFolderInfo } from '@/types/jellyfin'
import {
  getAlbums,
  getCollections,
  getEpisodes,
  getItemById,
  getItems,
  getSeasons,
  getTracks,
} from '@/services/items/api'
import { selectValidAuth, useApiStore } from '@/stores'
import {
  albumKeys,
  artistKeys,
  collectionsKeys,
  itemsKeys,
  seriesKeys,
} from './query-keys'

interface UseEntityOptions {
  enabled?: boolean
}

interface UseItemsOptions {
  parentId: string
  nameFilter?: string
  includeMediaStreams?: boolean
  excludeItemTypes?: Array<BaseItemKind>
  limit?: number
  startIndex?: number
  enabled?: boolean
}

type ItemsQueryOptionsInput = Omit<UseItemsOptions, 'enabled'>

export const itemsQueryOptions = {
  list: ({
    parentId,
    nameFilter,
    includeMediaStreams = false,
    excludeItemTypes,
    limit,
    startIndex,
  }: ItemsQueryOptionsInput) => {
    const trimmedFilter = nameFilter?.trim()

    return {
      ...createStandardQueryOptions<PagedItemsResult>({
        queryKey: itemsKeys.list(parentId, {
          includeMediaStreams,
          excludeItemTypes,
          limit,
          startIndex,
          searchTerm: trimmedFilter,
        }),
        queryFn: ({ signal }) =>
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
        cacheDuration: 'MEDIUM',
        operation: 'Fetch items',
      }),
      placeholderData: keepPreviousData,
    }
  },
  detail: (itemId: string) =>
    createStandardQueryOptions({
      queryKey: itemsKeys.detail(itemId),
      queryFn: (context) => getItemById(itemId, context),
      cacheDuration: 'LONG',
      operation: 'Fetch item',
    }),
} as const

export const seriesQueryOptions = {
  seasons: (seriesId: string) =>
    createStandardQueryOptions({
      queryKey: seriesKeys.seasons(seriesId),
      queryFn: (context) => getSeasons(seriesId, context),
      cacheDuration: 'LONG',
      operation: 'Fetch seasons',
    }),
  episodes: (seriesId: string, seasonId: string) =>
    createStandardQueryOptions({
      queryKey: seriesKeys.episodes(seriesId, seasonId),
      queryFn: (context) => getEpisodes(seriesId, seasonId, undefined, context),
      cacheDuration: 'LONG',
      operation: 'Fetch episodes',
    }),
} as const

export const albumQueryOptions = {
  tracks: (albumId: string) =>
    createStandardQueryOptions({
      queryKey: albumKeys.tracks(albumId),
      queryFn: (context) => getTracks(albumId, undefined, context),
      cacheDuration: 'LONG',
      operation: 'Fetch tracks',
    }),
} as const

export const artistQueryOptions = {
  albums: (artistId: string) =>
    createStandardQueryOptions({
      queryKey: artistKeys.albums(artistId),
      queryFn: (context) => getAlbums(artistId, context),
      cacheDuration: 'LONG',
      operation: 'Fetch albums',
    }),
} as const

const collectionsQueryOptions = {
  list: () =>
    createStandardQueryOptions<Array<VirtualFolderInfo>>({
      queryKey: collectionsKeys.list(),
      queryFn: ({ signal }) => getCollections({ signal }),
      cacheDuration: 'LONG',
      operation: 'Fetch collections',
    }),
} as const

const isEntityQueryEnabled = (
  id: string,
  validAuth: boolean,
  options?: UseEntityOptions,
) => validAuth && !!id && (options?.enabled ?? true)

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

  return useQuery({
    ...itemsQueryOptions.list({
      parentId,
      nameFilter,
      includeMediaStreams,
      excludeItemTypes,
      limit,
      startIndex,
    }),
    enabled: validAuth && enabled && !!parentId,
  })
}

export const useItem = (itemId: string, opts?: UseEntityOptions) => {
  const validAuth = useApiStore(selectValidAuth)

  return useQuery({
    ...itemsQueryOptions.detail(itemId),
    enabled: isEntityQueryEnabled(itemId, validAuth, opts),
  })
}

export const useSeasons = (seriesId: string, opts?: UseEntityOptions) => {
  const validAuth = useApiStore(selectValidAuth)

  return useQuery({
    ...seriesQueryOptions.seasons(seriesId),
    enabled: isEntityQueryEnabled(seriesId, validAuth, opts),
  })
}

export const useEpisodes = (
  seriesId: string,
  seasonId: string,
  opts?: UseEntityOptions,
) => {
  const validAuth = useApiStore(selectValidAuth)

  return useQuery({
    ...seriesQueryOptions.episodes(seriesId, seasonId),
    enabled: validAuth && !!seriesId && !!seasonId && (opts?.enabled ?? true),
  })
}

export function useCollections() {
  const validAuth = useApiStore(selectValidAuth)

  return useQuery({
    ...collectionsQueryOptions.list(),
    enabled: validAuth,
  })
}
