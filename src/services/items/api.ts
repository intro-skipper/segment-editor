/**
 * Items API service.
 * Handles fetching media items and collections from Jellyfin.
 */

import type { BaseItemDto, VirtualFolderInfo } from '@/types/jellyfin'
import { fetchWithAuth } from '@/services/jellyfin/client'

/**
 * Response from the Items API.
 */
interface ItemsResponse {
  Items?: Array<BaseItemDto>
  TotalRecordCount?: number
}

/**
 * Options for fetching items.
 */
export interface GetItemsOptions {
  /** Parent collection ID */
  parentId: string
  /** Include media streams in response */
  includeMediaStreams?: boolean
  /** Filter by name (client-side) */
  nameFilter?: string
  /** Maximum number of items to return */
  limit?: number
  /** Starting index for pagination */
  startIndex?: number
}

/**
 * Fetches all virtual folders (collections) from the server.
 * @returns Array of virtual folder info
 */
export async function getCollections(): Promise<Array<VirtualFolderInfo>> {
  try {
    const response = await fetchWithAuth<Array<VirtualFolderInfo>>(
      'Library/VirtualFolders',
    )
    return response
  } catch (error) {
    console.error('Failed to fetch collections:', error)
    return []
  }
}

/**
 * Fetches items from a collection.
 * @param options - Options for fetching items
 * @returns Array of base items
 */
export async function getItems(
  options: GetItemsOptions,
): Promise<Array<BaseItemDto>> {
  const { parentId, includeMediaStreams = true, limit, startIndex } = options

  if (!parentId) {
    return []
  }

  try {
    const query = new URLSearchParams()
    query.set('parentId', parentId)
    query.set('sortBy', 'AiredEpisodeOrder,SortName')
    query.set('isMissing', 'false')

    if (includeMediaStreams) {
      query.set('fields', 'MediaStreams')
    }

    if (limit != null) {
      query.set('limit', String(limit))
    }

    if (startIndex != null) {
      query.set('startIndex', String(startIndex))
    }

    const response = await fetchWithAuth<ItemsResponse>('Items', query)
    return response.Items ?? []
  } catch (error) {
    console.error('Failed to fetch items:', error)
    return []
  }
}

/**
 * Fetches a single item by ID.
 * @param itemId - The item ID to fetch
 * @returns The item or null if not found
 */
export async function getItemById(itemId: string): Promise<BaseItemDto | null> {
  if (!itemId) {
    return null
  }

  try {
    const query = new URLSearchParams()
    query.set('ids', itemId)
    query.set('fields', 'MediaStreams,Overview,People,Genres')

    const response = await fetchWithAuth<ItemsResponse>('Items', query)
    const items = response.Items ?? []

    return items.length > 0 ? items[0] : null
  } catch (error) {
    console.error('Failed to fetch item by ID:', error)
    return null
  }
}

/**
 * Fetches seasons for a series.
 * @param seriesId - The series ID
 * @returns Array of season items
 */
export async function getSeasons(
  seriesId: string,
): Promise<Array<BaseItemDto>> {
  if (!seriesId) {
    return []
  }

  try {
    const query = new URLSearchParams()
    query.set('parentId', seriesId)
    query.set('sortBy', 'SortName')
    query.set('isMissing', 'false')

    const response = await fetchWithAuth<ItemsResponse>(
      `Shows/${seriesId}/Seasons`,
      query,
    )
    return response.Items ?? []
  } catch (error) {
    console.error('Failed to fetch seasons:', error)
    return []
  }
}

/**
 * Fetches episodes for a season.
 * @param seriesId - The series ID
 * @param seasonId - The season ID
 * @returns Array of episode items
 */
export async function getEpisodes(
  seriesId: string,
  seasonId: string,
): Promise<Array<BaseItemDto>> {
  if (!seriesId || !seasonId) {
    return []
  }

  try {
    const query = new URLSearchParams()
    query.set('seasonId', seasonId)
    query.set('sortBy', 'AiredEpisodeOrder')
    query.set('isMissing', 'false')
    query.set('fields', 'MediaStreams')

    const response = await fetchWithAuth<ItemsResponse>(
      `Shows/${seriesId}/Episodes`,
      query,
    )
    return response.Items ?? []
  } catch (error) {
    console.error('Failed to fetch episodes:', error)
    return []
  }
}

/**
 * Fetches albums for an artist.
 * @param artistId - The artist ID
 * @returns Array of album items
 */
export async function getAlbums(artistId: string): Promise<Array<BaseItemDto>> {
  if (!artistId) {
    return []
  }

  try {
    const query = new URLSearchParams()
    query.set('artistIds', artistId)
    query.set('sortBy', 'ProductionYear,SortName')
    query.set('includeItemTypes', 'MusicAlbum')
    query.set('recursive', 'true')

    const response = await fetchWithAuth<ItemsResponse>('Items', query)
    return response.Items ?? []
  } catch (error) {
    console.error('Failed to fetch albums:', error)
    return []
  }
}

/**
 * Fetches tracks for an album.
 * @param albumId - The album ID
 * @returns Array of track items
 */
export async function getTracks(albumId: string): Promise<Array<BaseItemDto>> {
  if (!albumId) {
    return []
  }

  try {
    const query = new URLSearchParams()
    query.set('parentId', albumId)
    query.set('sortBy', 'ParentIndexNumber,IndexNumber')
    query.set('fields', 'MediaStreams')

    const response = await fetchWithAuth<ItemsResponse>('Items', query)
    return response.Items ?? []
  } catch (error) {
    console.error('Failed to fetch tracks:', error)
    return []
  }
}
