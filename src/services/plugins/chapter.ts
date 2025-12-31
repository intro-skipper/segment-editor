/**
 * Chapter plugin service.
 * Handles chapter generation for media items.
 */

import type { MediaSegmentDto } from '@/types/jellyfin'
import { fetchWithAuth, postJson } from '@/services/jellyfin/client'
import { secondsToTicks } from '@/lib/time-utils'
import { MediaSegmentType } from '@/types/jellyfin'
import { generateUUID } from '@/lib/segment-utils'

/**
 * Chapter data returned from the server.
 */
export interface ChapterData {
  /** Chapter content or metadata */
  [key: string]: unknown
}

/**
 * Chapter marker representing a single chapter point.
 */
export interface ChapterMarker {
  /** Chapter name/title */
  name: string
  /** Start time in seconds */
  startPositionSeconds: number
  /** End time in seconds (optional, defaults to next chapter or end of media) */
  endPositionSeconds?: number
}

/**
 * Known chapter names that map to specific segment types.
 */
const CHAPTER_NAME_TO_SEGMENT_TYPE: Record<string, MediaSegmentType> = {
  intro: MediaSegmentType.Intro,
  opening: MediaSegmentType.Intro,
  outro: MediaSegmentType.Outro,
  ending: MediaSegmentType.Outro,
  credits: MediaSegmentType.Outro,
  preview: MediaSegmentType.Preview,
  'next episode': MediaSegmentType.Preview,
  recap: MediaSegmentType.Recap,
  'previously on': MediaSegmentType.Recap,
  commercial: MediaSegmentType.Commercial,
  advertisement: MediaSegmentType.Commercial,
  ad: MediaSegmentType.Commercial,
}

/**
 * Determines the segment type from a chapter name.
 * @param name - The chapter name to analyze
 * @returns The corresponding MediaSegmentType
 */
export function getSegmentTypeFromChapterName(name: string): MediaSegmentType {
  const normalizedName = name.toLowerCase().trim()

  // Check for exact matches first
  if (normalizedName in CHAPTER_NAME_TO_SEGMENT_TYPE) {
    return CHAPTER_NAME_TO_SEGMENT_TYPE[normalizedName]
  }

  // Check for partial matches
  for (const [key, type] of Object.entries(CHAPTER_NAME_TO_SEGMENT_TYPE)) {
    if (normalizedName.includes(key)) {
      return type
    }
  }

  // Default to Intro for unknown chapter types
  return MediaSegmentType.Intro
}

/**
 * Converts a chapter marker to a MediaSegmentDto.
 * @param chapter - The chapter marker to convert
 * @param itemId - The media item ID for the segment
 * @param mediaDurationSeconds - Total media duration in seconds (used if endPositionSeconds is not provided)
 * @returns A MediaSegmentDto with the converted values
 */
export function chapterToSegment(
  chapter: ChapterMarker,
  itemId: string,
  mediaDurationSeconds?: number,
): MediaSegmentDto {
  // Validate chapter
  if (chapter.startPositionSeconds < 0) {
    throw new Error('Chapter start position cannot be negative')
  }

  const endSeconds =
    chapter.endPositionSeconds ??
    mediaDurationSeconds ??
    chapter.startPositionSeconds + 30

  if (chapter.startPositionSeconds >= endSeconds) {
    throw new Error('Chapter start must be less than end')
  }

  const segmentType = getSegmentTypeFromChapterName(chapter.name)

  return {
    Id: generateUUID(),
    ItemId: itemId,
    Type: segmentType,
    StartTicks: secondsToTicks(chapter.startPositionSeconds),
    EndTicks: secondsToTicks(endSeconds),
  }
}

/**
 * Converts a MediaSegmentDto to a chapter marker.
 * @param segment - The segment to convert
 * @returns A ChapterMarker with the converted values
 */
export function segmentToChapter(segment: MediaSegmentDto): ChapterMarker {
  const TICKS_PER_SECOND = 10_000_000

  const startSeconds = (segment.StartTicks ?? 0) / TICKS_PER_SECOND
  const endSeconds = (segment.EndTicks ?? 0) / TICKS_PER_SECOND

  // Generate chapter name from segment type
  const typeNames: Record<MediaSegmentType, string> = {
    [MediaSegmentType.Intro]: 'Intro',
    [MediaSegmentType.Outro]: 'Outro',
    [MediaSegmentType.Preview]: 'Preview',
    [MediaSegmentType.Recap]: 'Recap',
    [MediaSegmentType.Commercial]: 'Commercial',
    [MediaSegmentType.Unknown]: 'Unknown',
  }

  const segmentType = segment.Type ?? MediaSegmentType.Unknown
  const name = typeNames[segmentType]

  return {
    name,
    startPositionSeconds: startSeconds,
    endPositionSeconds: endSeconds,
  }
}

/**
 * Converts an array of chapter markers to MediaSegmentDto array.
 * @param chapters - Array of chapter markers
 * @param itemId - The media item ID for all segments
 * @param mediaDurationSeconds - Total media duration in seconds
 * @returns Array of MediaSegmentDto
 */
export function chaptersToSegments(
  chapters: Array<ChapterMarker>,
  itemId: string,
  mediaDurationSeconds?: number,
): Array<MediaSegmentDto> {
  return chapters.map((chapter) =>
    chapterToSegment(chapter, itemId, mediaDurationSeconds),
  )
}

/**
 * Converts an array of MediaSegmentDto to chapter markers.
 * @param segments - Array of segments to convert
 * @returns Array of ChapterMarker
 */
export function segmentsToChapters(
  segments: Array<MediaSegmentDto>,
): Array<ChapterMarker> {
  return segments.map(segmentToChapter)
}

/**
 * Result of chapter creation operation.
 */
export interface ChapterCreateResult {
  /** Whether the operation was successful */
  success: boolean
  /** Error message if operation failed */
  error?: string
}

/**
 * Gets chapter data for a specific item.
 * @param itemId - The ID of the media item
 * @returns Chapter data for the item
 */
export async function getChapterById(
  itemId: string,
): Promise<ChapterData | null> {
  try {
    const response = await fetchWithAuth<ChapterData>(
      `PluginChapter/Chapter/${itemId}`,
    )
    return response
  } catch (error) {
    console.error('Failed to get chapter data:', error)
    return null
  }
}

/**
 * Creates chapters for the specified item IDs.
 * Converts MediaSegments to chapter markers for the media items.
 * @param itemIds - Array of media item IDs to create chapters for
 * @returns Result indicating success or failure
 */
export async function createChapterById(
  itemIds: Array<string>,
): Promise<ChapterCreateResult> {
  try {
    const response = await postJson<unknown>('PluginChapter/Chapter', itemIds)

    if (response === false) {
      return {
        success: false,
        error: 'Failed to create chapters',
      }
    }

    return {
      success: true,
    }
  } catch (error) {
    console.error('Failed to create chapters:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
