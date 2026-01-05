/**
 * Items API service - Jellyfin media item fetching.
 *
 * Architecture:
 * - Uses withApi wrapper for consistent error/abort handling
 * - Validation separated from API calls (SRP)
 * - Schema validation on responses for data integrity
 *
 * Security: All inputs validated before use, API responses validated
 * against Zod schemas to ensure data integrity.
 */

import { ItemFields, SortOrder } from '@jellyfin/sdk/lib/generated-client'
import type { BaseItemDto, VirtualFolderInfo } from '@/types/jellyfin'
import { withApi } from '@/services/jellyfin/sdk'
import { AppError, logValidationWarning } from '@/lib/unified-error'
import {
  BaseItemArraySchema,
  VirtualFolderArraySchema,
  isValidItemId,
} from '@/lib/schemas'

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

// ─────────────────────────────────────────────────────────────────────────────
// Validation Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Validates items array against schema, logs warnings for invalid data */
const validateItems = (items: Array<BaseItemDto>, context: string) => {
  const result = BaseItemArraySchema.safeParse(items)
  if (!result.success) {
    logValidationWarning(`[Items] ${context}`, result.error)
  }
  return items
}

/** Validates Jellyfin ID format, throws on invalid */
const requireValidId = (id: string, name: string): void => {
  if (!isValidItemId(id)) {
    throw AppError.validation(`Invalid ${name} format`)
  }
}

/** Validates required parameter */
const requireParam = (value: unknown, name: string): void => {
  if (!value) throw AppError.validation(`${name} is required`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Common Field Sets (DRY)
// ─────────────────────────────────────────────────────────────────────────────

const DETAIL_FIELDS = [
  ItemFields.MediaStreams,
  ItemFields.Overview,
  ItemFields.People,
  ItemFields.Genres,
] as const

const SORT_ASCENDING = [SortOrder.Ascending] as const

// ─────────────────────────────────────────────────────────────────────────────
// API Operations
// ─────────────────────────────────────────────────────────────────────────────

export async function getCollections(): Promise<Array<VirtualFolderInfo>> {
  const result = await withApi(async (apis) => {
    const { data } = await apis.libraryStructureApi.getVirtualFolders()
    const validation = VirtualFolderArraySchema.safeParse(data)
    if (!validation.success) {
      logValidationWarning('[Items] Collections', validation.error)
    }
    return data
  })
  return result ?? []
}

export async function getItems({
  parentId,
  includeMediaStreams = true,
  limit,
  startIndex,
}: GetItemsOptions): Promise<Array<BaseItemDto>> {
  requireParam(parentId, 'Parent ID')
  requireValidId(parentId, 'Parent ID')

  const result = await withApi(async (apis) => {
    const { data } = await apis.itemsApi.getItems({
      parentId,
      sortBy: ['AiredEpisodeOrder', 'SortName'],
      sortOrder: [...SORT_ASCENDING],
      isMissing: false,
      fields: includeMediaStreams ? [ItemFields.MediaStreams] : undefined,
      limit,
      startIndex,
    })
    return validateItems(data.Items ?? [], 'getItems')
  })
  return result ?? []
}

export async function getItemById(itemId: string): Promise<BaseItemDto | null> {
  requireParam(itemId, 'Item ID')
  requireValidId(itemId, 'Item ID')

  const result = await withApi(async (apis) => {
    const { data } = await apis.itemsApi.getItems({
      ids: [itemId],
      fields: [...DETAIL_FIELDS],
    })
    const items = data.Items ?? []
    validateItems(items, 'getItemById')
    return items[0] ?? null
  })
  return result ?? null
}

export async function getSeasons(seriesId: string): Promise<Array<BaseItemDto>> {
  requireParam(seriesId, 'Series ID')
  requireValidId(seriesId, 'Series ID')

  const result = await withApi(async (apis) => {
    const { data } = await apis.tvShowsApi.getSeasons({
      seriesId,
      isMissing: false,
    })
    return validateItems(data.Items ?? [], 'getSeasons')
  })
  return result ?? []
}

export async function getEpisodes(
  seriesId: string,
  seasonId: string,
  options?: PaginationOptions,
): Promise<Array<BaseItemDto>> {
  requireParam(seriesId, 'Series ID')
  requireParam(seasonId, 'Season ID')
  requireValidId(seriesId, 'Series ID')
  requireValidId(seasonId, 'Season ID')

  const result = await withApi(async (apis) => {
    const { data } = await apis.tvShowsApi.getEpisodes({
      seriesId,
      seasonId,
      isMissing: false,
      fields: [ItemFields.MediaStreams],
      limit: options?.limit,
      startIndex: options?.startIndex,
    })
    return validateItems(data.Items ?? [], 'getEpisodes')
  })
  return result ?? []
}

export async function getAlbums(artistId: string): Promise<Array<BaseItemDto>> {
  requireParam(artistId, 'Artist ID')
  requireValidId(artistId, 'Artist ID')

  const result = await withApi(async (apis) => {
    const { data } = await apis.itemsApi.getItems({
      artistIds: [artistId],
      sortBy: ['ProductionYear', 'SortName'],
      sortOrder: [...SORT_ASCENDING],
      includeItemTypes: ['MusicAlbum'],
      recursive: true,
    })
    return validateItems(data.Items ?? [], 'getAlbums')
  })
  return result ?? []
}

export async function getTracks(
  albumId: string,
  options?: PaginationOptions,
): Promise<Array<BaseItemDto>> {
  requireParam(albumId, 'Album ID')
  requireValidId(albumId, 'Album ID')

  const result = await withApi(async (apis) => {
    const { data } = await apis.itemsApi.getItems({
      parentId: albumId,
      sortBy: ['ParentIndexNumber', 'IndexNumber'],
      sortOrder: [...SORT_ASCENDING],
      fields: [ItemFields.MediaStreams],
      limit: options?.limit,
      startIndex: options?.startIndex,
    })
    return validateItems(data.Items ?? [], 'getTracks')
  })
  return result ?? []
}
