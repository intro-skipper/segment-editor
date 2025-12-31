/**
 * Plugin services exports.
 */
export {
  testServerPlugins,
  isEdlAvailable,
  isChapterAvailable,
} from './detection'

export type { PluginAvailability, PluginTestResult } from './detection'

export {
  createEdlById,
  getEdlById,
  edlEntryToSegment,
  segmentToEdlEntry,
  edlToSegments,
  segmentsToEdl,
  EdlAction,
} from './edl'

export type { EdlEntry, EdlData, EdlCreateResult } from './edl'

export {
  createChapterById,
  getChapterById,
  chapterToSegment,
  segmentToChapter,
  chaptersToSegments,
  segmentsToChapters,
  getSegmentTypeFromChapterName,
} from './chapter'

export type { ChapterMarker, ChapterData, ChapterCreateResult } from './chapter'
