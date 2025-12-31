/**
 * Segment API service.
 * Handles CRUD operations for media segments.
 * Converts between ticks (server format) and seconds (UI format).
 */

import type { MediaSegmentDto, MediaSegmentType } from '@/types/jellyfin'
import { deleteJson, fetchWithAuth, postJson } from '@/services/jellyfin/client'
import { secondsToTicks, ticksToSeconds } from '@/lib/time-utils'
import { generateUUID } from '@/lib/segment-utils'
import { useAppStore } from '@/stores/app-store'

/**
 * Response from the MediaSegments API.
 */
interface MediaSegmentsResponse {
  Items?: Array<MediaSegmentDto>
  TotalRecordCount?: number
}

/**
 * Input for creating a new segment.
 */
export interface CreateSegmentInput {
  /** Item ID the segment belongs to */
  itemId: string
  /** Segment type */
  type: MediaSegmentType
  /** Start time in seconds */
  startSeconds: number
  /** End time in seconds */
  endSeconds: number
}

/**
 * Fetches all segments for a media item.
 * Converts tick values to seconds for UI display.
 * @param itemId - The media item ID
 * @returns Array of segments with times in seconds
 */
export async function getSegmentsById(
  itemId: string,
): Promise<Array<MediaSegmentDto>> {
  if (!itemId) {
    return []
  }

  try {
    const query = new URLSearchParams()
    query.set('itemId', itemId)

    const response = await fetchWithAuth<MediaSegmentsResponse>(
      `MediaSegments/${itemId}`,
      query,
    )

    const segments = response.Items ?? []

    // Convert ticks to seconds for UI
    return segments.map((segment) => ({
      ...segment,
      StartTicks: ticksToSeconds(segment.StartTicks),
      EndTicks: ticksToSeconds(segment.EndTicks),
    }))
  } catch (error) {
    console.error('Failed to fetch segments:', error)
    return []
  }
}

/**
 * Creates a new segment on the server.
 * Converts seconds to ticks for server storage.
 * @param segment - Segment data with times in seconds
 * @param providerId - Provider ID for the segment
 * @returns Created segment or false on failure
 */
export async function createSegment(
  segment: MediaSegmentDto,
  providerId?: string,
): Promise<MediaSegmentDto | false> {
  const provider = providerId ?? useAppStore.getState().providerId

  if (!provider) {
    console.error('Provider ID is required to create a segment')
    return false
  }

  if (!segment.ItemId) {
    console.error('Item ID is required to create a segment')
    return false
  }

  // Generate UUID if not provided
  const segmentId = segment.Id || generateUUID()

  // Convert seconds to ticks for server
  const serverSegment: MediaSegmentDto = {
    ...segment,
    Id: segmentId,
    StartTicks: secondsToTicks(segment.StartTicks ?? 0),
    EndTicks: secondsToTicks(segment.EndTicks ?? 0),
  }

  const query = new URLSearchParams()
  query.set('providerId', provider)

  const result = await postJson<MediaSegmentDto>(
    `MediaSegmentsApi/${segment.ItemId}`,
    serverSegment,
    query,
  )

  if (result === false) {
    return false
  }

  // Return segment with times converted back to seconds
  return {
    ...result,
    StartTicks: ticksToSeconds(result.StartTicks),
    EndTicks: ticksToSeconds(result.EndTicks),
  }
}

/**
 * Creates a new segment from input data.
 * Generates a UUID and handles tick conversion.
 * @param input - Segment creation input
 * @param providerId - Optional provider ID override
 * @returns Created segment or false on failure
 */
export async function createSegmentFromInput(
  input: CreateSegmentInput,
  providerId?: string,
): Promise<MediaSegmentDto | false> {
  const segment: MediaSegmentDto = {
    Id: generateUUID(),
    ItemId: input.itemId,
    Type: input.type,
    StartTicks: input.startSeconds,
    EndTicks: input.endSeconds,
  }

  return createSegment(segment, providerId)
}

/**
 * Deletes a segment from the server.
 * @param segment - Segment to delete
 * @returns True if deletion was successful
 */
export async function deleteSegment(
  segment: MediaSegmentDto,
): Promise<boolean> {
  if (!segment.Id) {
    console.error('Segment ID is required for deletion')
    return false
  }

  const query = new URLSearchParams()

  if (segment.ItemId) {
    query.set('itemId', segment.ItemId)
  }

  if (segment.Type != null) {
    query.set('type', String(segment.Type))
  }

  const result = await deleteJson(
    `MediaSegmentsApi/${segment.Id}`,
    undefined,
    query,
  )

  return result === true || (typeof result === 'object' && result !== null)
}

/**
 * Updates a segment by deleting the old one and creating a new one.
 * This is the pattern used by the Jellyfin API.
 * @param oldSegment - Existing segment to replace
 * @param newSegment - New segment data
 * @param providerId - Optional provider ID override
 * @returns Updated segment or false on failure
 */
export async function updateSegment(
  oldSegment: MediaSegmentDto,
  newSegment: MediaSegmentDto,
  providerId?: string,
): Promise<MediaSegmentDto | false> {
  // Delete the old segment first
  const deleted = await deleteSegment(oldSegment)

  if (!deleted) {
    console.error('Failed to delete old segment during update')
    return false
  }

  // Create the new segment
  return createSegment(newSegment, providerId)
}

/**
 * Batch saves segments by deleting existing ones and creating new ones.
 * @param itemId - Item ID for the segments
 * @param existingSegments - Segments to delete
 * @param newSegments - Segments to create
 * @param providerId - Optional provider ID override
 * @returns Array of created segments
 */
export async function batchSaveSegments(
  itemId: string,
  existingSegments: Array<MediaSegmentDto>,
  newSegments: Array<MediaSegmentDto>,
  providerId?: string,
): Promise<Array<MediaSegmentDto>> {
  // Delete all existing segments
  const deletePromises = existingSegments.map((segment) =>
    deleteSegment(segment),
  )
  await Promise.all(deletePromises)

  // Create all new segments
  const createPromises = newSegments.map((segment) =>
    createSegment(
      {
        ...segment,
        ItemId: itemId,
        Id: segment.Id || generateUUID(),
      },
      providerId,
    ),
  )

  const results = await Promise.all(createPromises)

  // Filter out failed creations
  return results.filter((result): result is MediaSegmentDto => result !== false)
}
