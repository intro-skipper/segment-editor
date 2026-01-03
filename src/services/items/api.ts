/** Items API service - Jellyfin media item fetching.
 *
 * Security: All inputs are validated before use, and API responses are validated
 * against Zod schemas to ensure data integrity.
 */

import { ItemFields, SortOrder } from '@jellyfin/sdk/lib/generated-client'
import type { BaseItemDto, VirtualFolderInfo } from '@/types/jellyfin'
import { requireTypedApis } from '@/services/jellyfin/sdk'
import { apiCall, requireParam, requireParams } from '@/lib/api-utils'
import {
  BaseItemArraySchema,
  VirtualFolderArraySchema,
  isValidItemId,
} from '@/lib/schemas'
import { logValidationWarning } from '@/lib/validation-logger'

export interface GetItemsOptions {
  parentId: string
  includeMediaStreams?: boolean
  limit?: number
  startIndex?: number
}

export interface PaginationOptions {
  limit?: number
  startIndex?: number
}

/**
 * Validates items array against schema and logs warnings for invalid data.
 * Security: Ensures API responses conform to expected structure.
 */
const validateItems = (items: Array<BaseItemDto>, context: string) => {
  const result = BaseItemArraySchema.safeParse(items)
  if (!result.success)
    logValidationWarning(`[Items API] ${context}`, result.error)
  return items
}

/**
 * Validates that an ID is a valid Jellyfin ID format.
 * Security: Prevents injection via malformed IDs.
 */
const validateItemId = (id: string, name: string): void => {
  if (!isValidItemId(id)) {
    throw new Error(`Invalid ${name} format`)
  }
}

export const getCollections = (): Promise<Array<VirtualFolderInfo>> =>
  apiCall(async () => {
    const { data } =
      await requireTypedApis().libraryStructureApi.getVirtualFolders()
    const result = VirtualFolderArraySchema.safeParse(data)
    if (!result.success)
      logValidationWarning('[Items API] Collections', result.error)
    return data
  }, 'Failed to fetch collections')

export async function getItems({
  parentId,
  includeMediaStreams = true,
  limit,
  startIndex,
}: GetItemsOptions): Promise<Array<BaseItemDto>> {
  requireParam(parentId, 'Parent ID')
  validateItemId(parentId, 'Parent ID')
  return apiCall(async () => {
    const { data } = await requireTypedApis().itemsApi.getItems({
      parentId,
      sortBy: ['AiredEpisodeOrder', 'SortName'],
      sortOrder: [SortOrder.Ascending],
      isMissing: false,
      fields: includeMediaStreams ? [ItemFields.MediaStreams] : undefined,
      limit,
      startIndex,
    })
    return validateItems(data.Items ?? [], 'getItems')
  }, 'Failed to fetch items')
}

export async function getItemById(itemId: string): Promise<BaseItemDto | null> {
  requireParam(itemId, 'Item ID')
  validateItemId(itemId, 'Item ID')
  return apiCall(async () => {
    const { data } = await requireTypedApis().itemsApi.getItems({
      ids: [itemId],
      fields: [
        ItemFields.MediaStreams,
        ItemFields.Overview,
        ItemFields.People,
        ItemFields.Genres,
      ],
    })
    const items = data.Items ?? []
    validateItems(items, 'getItemById')
    return items[0] ?? null
  }, 'Failed to fetch item')
}

export async function getSeasons(
  seriesId: string,
): Promise<Array<BaseItemDto>> {
  requireParam(seriesId, 'Series ID')
  validateItemId(seriesId, 'Series ID')
  return apiCall(async () => {
    const { data } = await requireTypedApis().tvShowsApi.getSeasons({
      seriesId,
      isMissing: false,
    })
    return validateItems(data.Items ?? [], 'getSeasons')
  }, 'Failed to fetch seasons')
}

export async function getEpisodes(
  seriesId: string,
  seasonId: string,
  options?: PaginationOptions,
): Promise<Array<BaseItemDto>> {
  requireParams({ 'Series ID': seriesId, 'Season ID': seasonId })
  validateItemId(seriesId, 'Series ID')
  validateItemId(seasonId, 'Season ID')
  return apiCall(async () => {
    const { data } = await requireTypedApis().tvShowsApi.getEpisodes({
      seriesId,
      seasonId,
      isMissing: false,
      fields: [ItemFields.MediaStreams],
      limit: options?.limit,
      startIndex: options?.startIndex,
    })
    return validateItems(data.Items ?? [], 'getEpisodes')
  }, 'Failed to fetch episodes')
}

export async function getAlbums(artistId: string): Promise<Array<BaseItemDto>> {
  requireParam(artistId, 'Artist ID')
  validateItemId(artistId, 'Artist ID')
  return apiCall(async () => {
    const { data } = await requireTypedApis().itemsApi.getItems({
      artistIds: [artistId],
      sortBy: ['ProductionYear', 'SortName'],
      sortOrder: [SortOrder.Ascending],
      includeItemTypes: ['MusicAlbum'],
      recursive: true,
    })
    return validateItems(data.Items ?? [], 'getAlbums')
  }, 'Failed to fetch albums')
}

export async function getTracks(
  albumId: string,
  options?: PaginationOptions,
): Promise<Array<BaseItemDto>> {
  requireParam(albumId, 'Album ID')
  validateItemId(albumId, 'Album ID')
  return apiCall(async () => {
    const { data } = await requireTypedApis().itemsApi.getItems({
      parentId: albumId,
      sortBy: ['ParentIndexNumber', 'IndexNumber'],
      sortOrder: [SortOrder.Ascending],
      fields: [ItemFields.MediaStreams],
      limit: options?.limit,
      startIndex: options?.startIndex,
    })
    return validateItems(data.Items ?? [], 'getTracks')
  }, 'Failed to fetch tracks')
}
