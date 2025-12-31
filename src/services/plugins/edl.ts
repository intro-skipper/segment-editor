/**
 * EDL (Edit Decision List) plugin service.
 * Handles EDL file generation for media items.
 */

import type { MediaSegmentDto } from '@/types/jellyfin'
import { fetchWithAuth, postJson } from '@/services/jellyfin/client'
import { secondsToTicks } from '@/lib/time-utils'
import { MediaSegmentType } from '@/types/jellyfin'
import { generateUUID } from '@/lib/segment-utils'

/**
 * EDL data returned from the server.
 */
export interface EdlData {
  /** EDL file content or metadata */
  [key: string]: unknown
}

/**
 * EDL entry representing a single edit decision.
 * Standard EDL format uses seconds for timing.
 */
export interface EdlEntry {
  /** Start time in seconds */
  start: number
  /** End time in seconds */
  end: number
  /** EDL action type: 0=Cut, 1=Mute, 2=Scene, 3=Commercial */
  action: EdlAction
}

/**
 * EDL action types.
 * These map to different segment behaviors in media players.
 */
export enum EdlAction {
  /** Cut - skip this section entirely */
  Cut = 0,
  /** Mute - play but mute audio */
  Mute = 1,
  /** Scene - mark as scene marker */
  Scene = 2,
  /** Commercial - mark as commercial break */
  Commercial = 3,
}

/**
 * Maps EDL action types to MediaSegmentType.
 */
const EDL_ACTION_TO_SEGMENT_TYPE: Record<EdlAction, MediaSegmentType> = {
  [EdlAction.Cut]: MediaSegmentType.Intro,
  [EdlAction.Mute]: MediaSegmentType.Outro,
  [EdlAction.Scene]: MediaSegmentType.Preview,
  [EdlAction.Commercial]: MediaSegmentType.Commercial,
}

/**
 * Maps MediaSegmentType to EDL action types.
 */
const SEGMENT_TYPE_TO_EDL_ACTION: Partial<Record<MediaSegmentType, EdlAction>> =
  {
    [MediaSegmentType.Intro]: EdlAction.Cut,
    [MediaSegmentType.Outro]: EdlAction.Cut,
    [MediaSegmentType.Preview]: EdlAction.Scene,
    [MediaSegmentType.Recap]: EdlAction.Scene,
    [MediaSegmentType.Commercial]: EdlAction.Commercial,
  }

/**
 * Converts an EDL entry to a MediaSegmentDto.
 * @param entry - The EDL entry to convert
 * @param itemId - The media item ID for the segment
 * @returns A MediaSegmentDto with the converted values
 */
export function edlEntryToSegment(
  entry: EdlEntry,
  itemId: string,
): MediaSegmentDto {
  // Validate entry
  if (entry.start < 0 || entry.end < 0) {
    throw new Error('EDL entry times cannot be negative')
  }
  if (entry.start >= entry.end) {
    throw new Error('EDL entry start must be less than end')
  }

  const segmentType = EDL_ACTION_TO_SEGMENT_TYPE[entry.action]

  return {
    Id: generateUUID(),
    ItemId: itemId,
    Type: segmentType,
    StartTicks: secondsToTicks(entry.start),
    EndTicks: secondsToTicks(entry.end),
  }
}

/**
 * Converts a MediaSegmentDto to an EDL entry.
 * @param segment - The segment to convert
 * @returns An EdlEntry with the converted values
 */
export function segmentToEdlEntry(segment: MediaSegmentDto): EdlEntry {
  const TICKS_PER_SECOND = 10_000_000

  const start = (segment.StartTicks ?? 0) / TICKS_PER_SECOND
  const end = (segment.EndTicks ?? 0) / TICKS_PER_SECOND

  const segmentType = segment.Type ?? MediaSegmentType.Intro
  const mappedAction = SEGMENT_TYPE_TO_EDL_ACTION[segmentType]
  const action = mappedAction !== undefined ? mappedAction : EdlAction.Cut

  return {
    start,
    end,
    action,
  }
}

/**
 * Converts an array of EDL entries to MediaSegmentDto array.
 * @param entries - Array of EDL entries
 * @param itemId - The media item ID for all segments
 * @returns Array of MediaSegmentDto
 */
export function edlToSegments(
  entries: Array<EdlEntry>,
  itemId: string,
): Array<MediaSegmentDto> {
  return entries.map((entry) => edlEntryToSegment(entry, itemId))
}

/**
 * Converts an array of MediaSegmentDto to EDL entries.
 * @param segments - Array of segments to convert
 * @returns Array of EdlEntry
 */
export function segmentsToEdl(
  segments: Array<MediaSegmentDto>,
): Array<EdlEntry> {
  return segments.map(segmentToEdlEntry)
}

/**
 * Result of EDL creation operation.
 */
export interface EdlCreateResult {
  /** Whether the operation was successful */
  success: boolean
  /** Error message if operation failed */
  error?: string
}

/**
 * Gets EDL data for a specific item.
 * @param itemId - The ID of the media item
 * @returns EDL data for the item
 */
export async function getEdlById(itemId: string): Promise<EdlData | null> {
  try {
    const response = await fetchWithAuth<EdlData>(`PluginEdl/Edl/${itemId}`)
    return response
  } catch (error) {
    console.error('Failed to get EDL data:', error)
    return null
  }
}

/**
 * Creates EDL files for the specified item IDs.
 * Converts MediaSegments to EDL format for use with media players.
 * @param itemIds - Array of media item IDs to create EDL files for
 * @returns Result indicating success or failure
 */
export async function createEdlById(
  itemIds: Array<string>,
): Promise<EdlCreateResult> {
  try {
    const response = await postJson<unknown>('PluginEdl/Edl', itemIds)

    if (response === false) {
      return {
        success: false,
        error: 'Failed to create EDL files',
      }
    }

    return {
      success: true,
    }
  } catch (error) {
    console.error('Failed to create EDL files:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
