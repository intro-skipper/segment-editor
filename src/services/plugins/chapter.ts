/**
 * Chapter plugin service.
 * Handles chapter generation for media items.
 */

import { fetchWithAuth, postJson } from '@/services/jellyfin/client'

/**
 * Chapter data returned from the server.
 */
export interface ChapterData {
  /** Chapter content or metadata */
  [key: string]: unknown
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
