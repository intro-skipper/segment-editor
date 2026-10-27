import { useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { createStandardQueryOptions } from '@/hooks/queries/create-query-hook'
import {
  keepPreviousDataOf,
  useServerQuery,
} from '@/hooks/queries/query-identity'
import type { QueryIdentity } from '@/hooks/queries/query-identity'
import { resolveAdjacentEpisodes } from '@/lib/adjacent-episodes'
import { inSeriesOrder } from '@/lib/series-utils'
import type { PagedItemsResult } from '@/services/items/api'
import type {
  BaseItemDto,
  BaseItemKind,
  VirtualFolderInfo,
} from '@/types/jellyfin'
import {
  getAlbums,
  getCollections,
  getEpisodes,
  getItemById,
  getItems,
  getSeasons,
  getTracks,
} from '@/services/items/api'
import {
  albumKeys,
  artistKeys,
  collectionsKeys,
  itemsKeys,
  seriesKeys,
} from './query-keys'

/**
 * Stable default for an unresolved items query (`data` while the query is
 * disabled or loading). An inline `= []` default at the call site allocates a
 * new array identity every render, defeating memoization keyed on the data.
 */
export const NO_ITEMS: Array<BaseItemDto> = []

interface UseEntityOptions {
  enabled?: boolean
}

export interface UseItemsOptions {
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
  list: (
    identity: QueryIdentity,
    {
      parentId,
      nameFilter,
      includeMediaStreams = false,
      excludeItemTypes,
      limit,
      startIndex,
    }: ItemsQueryOptionsInput,
  ) => {
    const trimmedFilter = nameFilter?.trim()

    return {
      ...createStandardQueryOptions<PagedItemsResult>({
        queryKey: itemsKeys.list(identity, parentId, {
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
      placeholderData: keepPreviousDataOf(identity),
    }
  },
  detail: (identity: QueryIdentity, itemId: string) =>
    createStandardQueryOptions({
      queryKey: itemsKeys.detail(identity, itemId),
      queryFn: (context) => getItemById(itemId, context),
      cacheDuration: 'LONG',
      operation: 'Fetch item',
    }),
} as const

export const seriesQueryOptions = {
  /** The series' seasons in Series Order. */
  seasons: (identity: QueryIdentity, seriesId: string) =>
    createStandardQueryOptions({
      queryKey: seriesKeys.seasons(identity, seriesId),
      queryFn: async (context) =>
        inSeriesOrder(await getSeasons(seriesId, context)),
      cacheDuration: 'LONG',
      operation: 'Fetch seasons',
    }),
  episodes: (identity: QueryIdentity, seriesId: string, seasonId: string) =>
    createStandardQueryOptions({
      queryKey: seriesKeys.episodes(identity, seriesId, seasonId),
      queryFn: (context) => getEpisodes(seriesId, seasonId, undefined, context),
      cacheDuration: 'LONG',
      operation: 'Fetch episodes',
    }),
  /** Adjacent Episodes of `episode`, resolved through the cached seasons and episodes queries above. */
  adjacentEpisodes: (
    identity: QueryIdentity,
    episode: BaseItemDto,
    queryClient: QueryClient,
  ) =>
    createStandardQueryOptions({
      queryKey: seriesKeys.adjacentEpisodes(
        identity,
        episode.SeriesId ?? '',
        episode.Id ?? '',
      ),
      queryFn: () =>
        resolveAdjacentEpisodes(
          {
            fetchSeasons: (seriesId) =>
              queryClient.fetchQuery(
                seriesQueryOptions.seasons(identity, seriesId),
              ),
            fetchEpisodes: (seriesId, seasonId) =>
              queryClient.fetchQuery(
                seriesQueryOptions.episodes(identity, seriesId, seasonId),
              ),
          },
          episode,
        ),
      cacheDuration: 'LONG',
      operation: 'Fetch adjacent episodes',
    }),
} as const

export const albumQueryOptions = {
  tracks: (identity: QueryIdentity, albumId: string) =>
    createStandardQueryOptions({
      queryKey: albumKeys.tracks(identity, albumId),
      queryFn: (context) => getTracks(albumId, undefined, context),
      cacheDuration: 'LONG',
      operation: 'Fetch tracks',
    }),
} as const

export const artistQueryOptions = {
  albums: (identity: QueryIdentity, artistId: string) =>
    createStandardQueryOptions({
      queryKey: artistKeys.albums(identity, artistId),
      queryFn: (context) => getAlbums(artistId, context),
      cacheDuration: 'LONG',
      operation: 'Fetch albums',
    }),
} as const

const collectionsQueryOptions = {
  list: (identity: QueryIdentity) =>
    createStandardQueryOptions<Array<VirtualFolderInfo>>({
      queryKey: collectionsKeys.list(identity),
      queryFn: ({ signal }) => getCollections({ signal }),
      cacheDuration: 'LONG',
      operation: 'Fetch collections',
    }),
} as const

export function useItems({
  parentId,
  nameFilter,
  includeMediaStreams = false,
  excludeItemTypes,
  limit,
  startIndex,
  enabled = true,
}: UseItemsOptions) {
  return useServerQuery(
    (identity) =>
      itemsQueryOptions.list(identity, {
        parentId,
        nameFilter,
        includeMediaStreams,
        excludeItemTypes,
        limit,
        startIndex,
      }),
    enabled && !!parentId,
  )
}

export const useItem = (itemId: string, opts?: UseEntityOptions) =>
  useServerQuery(
    (identity) => itemsQueryOptions.detail(identity, itemId),
    !!itemId && (opts?.enabled ?? true),
  )

export const useSeasons = (seriesId: string, opts?: UseEntityOptions) =>
  useServerQuery(
    (identity) => seriesQueryOptions.seasons(identity, seriesId),
    !!seriesId && (opts?.enabled ?? true),
  )

/** Previous and next episode in Series Order for the arrows and hotkeys in the header. */
export const useAdjacentEpisodes = (episode: BaseItemDto) => {
  const queryClient = useQueryClient()

  return useServerQuery(
    (identity) =>
      seriesQueryOptions.adjacentEpisodes(identity, episode, queryClient),
    !!episode.SeriesId && !!episode.SeasonId && !!episode.Id,
  )
}

export const useEpisodes = (
  seriesId: string,
  seasonId: string,
  opts?: UseEntityOptions,
) =>
  useServerQuery(
    (identity) => seriesQueryOptions.episodes(identity, seriesId, seasonId),
    !!seriesId && !!seasonId && (opts?.enabled ?? true),
  )

export function useCollections() {
  return useServerQuery((identity) => collectionsQueryOptions.list(identity))
}
