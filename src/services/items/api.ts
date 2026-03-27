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
import type { BaseItemKind } from '@jellyfin/sdk/lib/generated-client'
import type { BaseItemDto, VirtualFolderInfo } from '@/types/jellyfin'
import type { ApiOptions } from '@/services/jellyfin'
import { getRequestConfig, withApi } from '@/services/jellyfin'
import { AppError, logValidationWarning } from '@/lib/unified-error'
import {
  BaseItemArraySchema,
  VirtualFolderArraySchema,
  isValidItemId,
} from '@/lib/schemas'

interface GetItemsOptions {
  parentId: string
  searchTerm?: string
  includeMediaStreams?: boolean
  excludeItemTypes?: Array<BaseItemKind>
  limit?: number
  startIndex?: number
}

export interface PagedItemsResult {
  items: Array<BaseItemDto>
  totalCount: number
}

interface PaginationOptions {
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
  ItemFields.MediaSources,
  ItemFields.Overview,
  ItemFields.People,
  ItemFields.Genres,
  ItemFields.Chapters,
  ItemFields.Trickplay,
] as const

const SORT_ASCENDING = [SortOrder.Ascending] as const

// ─────────────────────────────────────────────────────────────────────────────
// API Operations
// ─────────────────────────────────────────────────────────────────────────────

export async function getCollections(
  options?: ApiOptions,
): Promise<Array<VirtualFolderInfo>> {
  const result = await withApi(async (apis) => {
    const { data } = await apis.libraryStructureApi.getVirtualFolders(
      getRequestConfig(options),
    )
    const validation = VirtualFolderArraySchema.safeParse(data)
    if (!validation.success) {
      logValidationWarning('[Items] Collections', validation.error)
    }
    return data.filter((folder) => folder.CollectionType !== 'homevideos')
  }, options)
  return result ?? []
}

export async function getItems(
  {
    parentId,
    searchTerm,
    includeMediaStreams = false,
    excludeItemTypes,
    limit,
    startIndex,
  }: GetItemsOptions,
  options?: ApiOptions,
): Promise<PagedItemsResult> {
  requireParam(parentId, 'Parent ID')
  requireValidId(parentId, 'Parent ID')

  const result = await withApi(async (apis) => {
    const { data } = await apis.itemsApi.getItems(
      {
        parentId,
        searchTerm,
        sortBy: ['AiredEpisodeOrder', 'SortName'],
        sortOrder: [...SORT_ASCENDING],
        isMissing: false,
        excludeItemTypes,
        recursive: !!searchTerm,
        fields: includeMediaStreams
          ? [ItemFields.MediaStreams, ItemFields.MediaSources]
          : undefined,
        limit,
        startIndex,
      },
      getRequestConfig(options),
    )
    const items = validateItems(data.Items ?? [], 'getItems')
    return {
      items,
      totalCount: data.TotalRecordCount ?? items.length,
    }
  }, options)
  return result ?? { items: [], totalCount: 0 }
}

export async function getItemById(
  itemId: string,
  options?: ApiOptions,
): Promise<BaseItemDto | null> {
  requireParam(itemId, 'Item ID')
  requireValidId(itemId, 'Item ID')

  const result = await withApi(async (apis) => {
    const { data } = await apis.itemsApi.getItems(
      {
        ids: [itemId],
        fields: [...DETAIL_FIELDS],
      },
      getRequestConfig(options),
    )
    const items = data.Items ?? []
    validateItems(items, 'getItemById')
    return items[0] ?? null
  }, options)
  return result ?? null
}

export async function getSeasons(
  seriesId: string,
  options?: ApiOptions,
): Promise<Array<BaseItemDto>> {
  requireParam(seriesId, 'Series ID')
  requireValidId(seriesId, 'Series ID')

  const result = await withApi(async (apis) => {
    const { data } = await apis.tvShowsApi.getSeasons(
      {
        seriesId,
        isMissing: false,
      },
      getRequestConfig(options),
    )
    return validateItems(data.Items ?? [], 'getSeasons')
  }, options)
  return result ?? []
}

export async function getEpisodes(
  seriesId: string,
  seasonId: string,
  options?: PaginationOptions,
  apiOptions?: ApiOptions,
): Promise<Array<BaseItemDto>> {
  requireParam(seriesId, 'Series ID')
  requireParam(seasonId, 'Season ID')
  requireValidId(seriesId, 'Series ID')
  requireValidId(seasonId, 'Season ID')

  const result = await withApi(async (apis) => {
    const { data } = await apis.tvShowsApi.getEpisodes(
      {
        seriesId,
        seasonId,
        isMissing: false,
        fields: [ItemFields.MediaStreams, ItemFields.MediaSources],
        limit: options?.limit,
        startIndex: options?.startIndex,
      },
      getRequestConfig(apiOptions),
    )
    return validateItems(data.Items ?? [], 'getEpisodes')
  }, apiOptions)
  return result ?? []
}

export async function getAlbums(
  artistId: string,
  options?: ApiOptions,
): Promise<Array<BaseItemDto>> {
  requireParam(artistId, 'Artist ID')
  requireValidId(artistId, 'Artist ID')

  const result = await withApi(async (apis) => {
    const { data } = await apis.itemsApi.getItems(
      {
        artistIds: [artistId],
        sortBy: ['ProductionYear', 'SortName'],
        sortOrder: [...SORT_ASCENDING],
        includeItemTypes: ['MusicAlbum'],
        recursive: true,
      },
      getRequestConfig(options),
    )
    return validateItems(data.Items ?? [], 'getAlbums')
  }, options)
  return result ?? []
}

export async function getTracks(
  albumId: string,
  options?: PaginationOptions,
  apiOptions?: ApiOptions,
): Promise<Array<BaseItemDto>> {
  requireParam(albumId, 'Album ID')
  requireValidId(albumId, 'Album ID')

  const result = await withApi(async (apis) => {
    const { data } = await apis.itemsApi.getItems(
      {
        parentId: albumId,
        sortBy: ['ParentIndexNumber', 'IndexNumber'],
        sortOrder: [...SORT_ASCENDING],
        fields: [ItemFields.MediaStreams, ItemFields.MediaSources],
        limit: options?.limit,
        startIndex: options?.startIndex,
      },
      getRequestConfig(apiOptions),
    )
    return validateItems(data.Items ?? [], 'getTracks')
  }, apiOptions)
  return result ?? []
}
