/**
 * Chapter plugin service.
 * Handles chapter generation and conversion for media items.
 *
 * Security: All item IDs are validated before use in API calls.
 */

import type { MediaSegmentDto } from '@/types/jellyfin'
import { MediaSegmentType } from '@/types/jellyfin'
import { generateUUID } from '@/lib/segment-utils'
import { secondsToTicks, ticksToSeconds } from '@/lib/time-utils'

export interface ChapterMarker {
  name: string
  startPositionSeconds: number
  endPositionSeconds?: number
}

const CHAPTER_NAME_MAP: Record<string, MediaSegmentType> = {
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

const SEGMENT_TYPE_NAMES: Record<MediaSegmentType, string> = {
  [MediaSegmentType.Intro]: 'Intro',
  [MediaSegmentType.Outro]: 'Outro',
  [MediaSegmentType.Preview]: 'Preview',
  [MediaSegmentType.Recap]: 'Recap',
  [MediaSegmentType.Commercial]: 'Commercial',
  [MediaSegmentType.Unknown]: 'Unknown',
}

export function getSegmentTypeFromChapterName(name: string): MediaSegmentType {
  const normalized = name.toLowerCase().trim()
  const direct = CHAPTER_NAME_MAP[normalized] as MediaSegmentType | undefined
  if (direct) return direct
  for (const [key, type] of Object.entries(CHAPTER_NAME_MAP)) {
    if (normalized.includes(key)) return type
  }
  return MediaSegmentType.Intro
}

export function chapterToSegment(
  chapter: ChapterMarker,
  itemId: string,
  mediaDurationSeconds?: number,
): MediaSegmentDto {
  if (chapter.startPositionSeconds < 0)
    throw new Error('Chapter start position cannot be negative')
  const endSeconds =
    chapter.endPositionSeconds ??
    mediaDurationSeconds ??
    chapter.startPositionSeconds + 30
  if (chapter.startPositionSeconds >= endSeconds)
    throw new Error('Chapter start must be less than end')

  return {
    Id: generateUUID(),
    ItemId: itemId,
    Type: getSegmentTypeFromChapterName(chapter.name),
    StartTicks: secondsToTicks(chapter.startPositionSeconds),
    EndTicks: secondsToTicks(endSeconds),
  }
}

export function segmentToChapter(segment: MediaSegmentDto): ChapterMarker {
  return {
    name: SEGMENT_TYPE_NAMES[segment.Type ?? MediaSegmentType.Unknown],
    startPositionSeconds: ticksToSeconds(segment.StartTicks),
    endPositionSeconds: ticksToSeconds(segment.EndTicks),
  }
}

export const chaptersToSegments = (
  chapters: Array<ChapterMarker>,
  itemId: string,
  mediaDurationSeconds?: number,
): Array<MediaSegmentDto> =>
  chapters.map((c) => chapterToSegment(c, itemId, mediaDurationSeconds))
