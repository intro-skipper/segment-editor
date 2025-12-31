/**
 * EDL (Edit Decision List) plugin service.
 * Handles EDL file generation for media items.
 */

import { fetchWithAuth, postJson } from '@/services/jellyfin/client'

/**
 * EDL data returned from the server.
 */
export interface EdlData {
  /** EDL file content or metadata */
  [key: string]: unknown
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
