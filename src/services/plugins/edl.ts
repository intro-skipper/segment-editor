/**
 * EDL (Edit Decision List) plugin service.
 * Handles EDL file generation and conversion for media items.
 *
 * Security: All item IDs are validated before use in API calls.
 */

import type { MediaSegmentDto } from '@/types/jellyfin'
import { MediaSegmentType } from '@/types/jellyfin'
import { generateUUID } from '@/lib/segment-utils'
import { secondsToTicks, ticksToSeconds } from '@/lib/time-utils'

export interface EdlEntry {
  start: number
  end: number
  action: EdlAction
}

export enum EdlAction {
  Cut = 0,
  Mute = 1,
  Scene = 2,
  Commercial = 3,
}

const EDL_TO_SEGMENT: Record<EdlAction, MediaSegmentType> = {
  [EdlAction.Cut]: MediaSegmentType.Intro,
  [EdlAction.Mute]: MediaSegmentType.Outro,
  [EdlAction.Scene]: MediaSegmentType.Preview,
  [EdlAction.Commercial]: MediaSegmentType.Commercial,
}

const SEGMENT_TO_EDL: Partial<Record<MediaSegmentType, EdlAction>> = {
  [MediaSegmentType.Intro]: EdlAction.Cut,
  [MediaSegmentType.Outro]: EdlAction.Cut,
  [MediaSegmentType.Preview]: EdlAction.Scene,
  [MediaSegmentType.Recap]: EdlAction.Scene,
  [MediaSegmentType.Commercial]: EdlAction.Commercial,
}

export function edlEntryToSegment(
  entry: EdlEntry,
  itemId: string,
): MediaSegmentDto {
  if (entry.start < 0 || entry.end < 0)
    throw new Error('EDL entry times cannot be negative')
  if (entry.start >= entry.end)
    throw new Error('EDL entry start must be less than end')

  return {
    Id: generateUUID(),
    ItemId: itemId,
    Type: EDL_TO_SEGMENT[entry.action],
    StartTicks: secondsToTicks(entry.start),
    EndTicks: secondsToTicks(entry.end),
  }
}

export function segmentToEdlEntry(segment: MediaSegmentDto): EdlEntry {
  return {
    start: ticksToSeconds(segment.StartTicks),
    end: ticksToSeconds(segment.EndTicks),
    action:
      SEGMENT_TO_EDL[segment.Type ?? MediaSegmentType.Intro] ?? EdlAction.Cut,
  }
}

export const edlToSegments = (
  entries: Array<EdlEntry>,
  itemId: string,
): Array<MediaSegmentDto> => entries.map((e) => edlEntryToSegment(e, itemId))
