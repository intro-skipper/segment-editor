/**
 * Query hooks barrel export.
 */

export { useCollections, collectionsKeys } from './use-collections'
export {
  useItems,
  useItem,
  useEpisodes,
  useSeasons,
  useTracks,
  useAlbums,
  itemsKeys,
  seriesKeys,
  albumKeys,
  artistKeys,
  type UseItemsOptions,
} from './use-items'
export {
  useSegments,
  segmentsKeys,
  type UseSegmentsOptions,
} from './use-segments'
export { QUERY_STALE_TIMES, QUERY_GC_TIMES } from './query-constants'
export {
  QueryError,
  type QueryErrorCode,
  shouldRetryQuery,
  getRetryDelay,
  handleQueryError,
  createQueryKey,
  getErrorMessage,
} from './query-error-handling'
export {
  createStandardQueryOptions,
  type CacheDuration,
  type StandardQueryOptions,
} from './create-query-hook'
