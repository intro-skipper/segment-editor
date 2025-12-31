/**
 * Segment API service exports.
 */
export {
  getSegmentsById,
  createSegment,
  createSegmentFromInput,
  deleteSegment,
  updateSegment,
  batchSaveSegments,
} from './api'

export type { CreateSegmentInput } from './api'
