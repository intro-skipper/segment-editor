/**
 * Hooks barrel export.
 */

// Query hooks
export {
  useCollections,
  collectionsKeys,
  useItems,
  useItem,
  itemsKeys,
  useSegments,
  segmentsKeys,
  type UseItemsOptions,
  type UseSegmentsOptions,
} from './queries'

// Mutation hooks
export {
  useCreateSegment,
  useCreateSegmentFromDto,
  useDeleteSegment,
  useBatchSaveSegments,
  type BatchSaveInput,
} from './mutations'
