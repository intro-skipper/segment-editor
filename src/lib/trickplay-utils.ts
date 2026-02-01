/**
 * Trickplay utilities for calculating thumbnail positions and URLs.
 * Trickplay provides video preview thumbnails organized in tile images (sprite sheets).
 */

import type { TrickplayInfoDto } from '@/types/jellyfin'

/** Structure for the trickplay data from BaseItemDto.Trickplay */
export type TrickplayData = {
  [mediaSourceId: string]: {
    [width: string]: TrickplayInfoDto
  }
}

/** Computed trickplay position for rendering */
export interface TrickplayPosition {
  /** URL to the tile image */
  tileUrl: string
  /** X position within the tile (in pixels) */
  offsetX: number
  /** Y position within the tile (in pixels) */
  offsetY: number
  /** Width of a single thumbnail */
  thumbnailWidth: number
  /** Height of a single thumbnail */
  thumbnailHeight: number
}

/**
 * Gets the best available trickplay info for an item.
 * Prefers smaller widths for faster loading, returns the first media source.
 */
export function getBestTrickplayInfo(
  trickplay: TrickplayData | null | undefined,
): { mediaSourceId: string; info: TrickplayInfoDto } | null {
  if (!trickplay) return null

  const mediaSourceIds = Object.keys(trickplay)
  if (mediaSourceIds.length === 0) return null

  const mediaSourceId = mediaSourceIds[0]
  const widthMap = trickplay[mediaSourceId]

  const widths = Object.keys(widthMap)
    .map(Number)
    .filter((w) => !isNaN(w))
    .sort((a, b) => a - b)

  if (widths.length === 0) return null

  // Prefer width around 320px for good quality/size balance
  const preferredWidth =
    widths.find((w) => w >= 320) ?? widths[widths.length - 1]
  const info = widthMap[String(preferredWidth)]

  return { mediaSourceId, info }
}

/**
 * Calculates the trickplay position for a given time.
 *
 * @param timeSeconds - The current hover time in seconds
 * @param info - The trickplay info containing tile dimensions and interval
 * @param itemId - The item ID for URL construction
 * @param mediaSourceId - The media source ID
 * @param serverAddress - The Jellyfin server base URL
 * @param apiKey - Optional API key for authentication
 * @returns The trickplay position data for rendering, or null if unavailable
 */
export function getTrickplayPosition(
  timeSeconds: number,
  info: TrickplayInfoDto,
  itemId: string,
  mediaSourceId: string,
  serverAddress: string,
  apiKey?: string,
): TrickplayPosition | null {
  const {
    Width: thumbnailWidth,
    Height: thumbnailHeight,
    TileWidth: tilesPerRow,
    TileHeight: tilesPerColumn,
    ThumbnailCount: totalThumbnails,
    Interval: intervalMs,
  } = info

  // Validate required properties
  if (
    !thumbnailWidth ||
    !thumbnailHeight ||
    !tilesPerRow ||
    !tilesPerColumn ||
    !totalThumbnails ||
    !intervalMs
  ) {
    return null
  }

  // Calculate which thumbnail index this time maps to
  const thumbnailIndex = Math.min(
    Math.floor((timeSeconds * 1000) / intervalMs),
    totalThumbnails - 1,
  )

  if (thumbnailIndex < 0) return null

  // Calculate thumbnails per tile
  const thumbnailsPerTile = tilesPerRow * tilesPerColumn

  // Calculate which tile image this thumbnail is in
  const tileIndex = Math.floor(thumbnailIndex / thumbnailsPerTile)

  // Calculate position within the tile
  const positionInTile = thumbnailIndex % thumbnailsPerTile
  const tileX = positionInTile % tilesPerRow
  const tileY = Math.floor(positionInTile / tilesPerRow)

  // Calculate pixel offsets
  const offsetX = tileX * thumbnailWidth
  const offsetY = tileY * thumbnailHeight

  // Build the tile image URL
  const tileUrl = buildTrickplayTileUrl(
    serverAddress,
    itemId,
    thumbnailWidth,
    tileIndex,
    mediaSourceId,
    apiKey,
  )

  return {
    tileUrl,
    offsetX,
    offsetY,
    thumbnailWidth,
    thumbnailHeight,
  }
}

/**
 * Builds the URL for a trickplay tile image.
 *
 * @param serverAddress - The Jellyfin server base URL
 * @param itemId - The item ID
 * @param width - The trickplay resolution width
 * @param tileIndex - The tile index (0-based)
 * @param mediaSourceId - The media source ID
 * @param apiKey - Optional API key for authentication
 * @returns The complete URL to the tile image
 */
export function buildTrickplayTileUrl(
  serverAddress: string,
  itemId: string,
  width: number,
  tileIndex: number,
  mediaSourceId: string,
  apiKey?: string,
): string {
  // Remove trailing slash from serverAddress to prevent double slashes
  const baseUrl = serverAddress.replace(/\/+$/, '')

  const params = new URLSearchParams()
  params.set('mediaSourceId', mediaSourceId)
  if (apiKey) {
    params.set('api_key', apiKey)
  }

  return `${baseUrl}/Videos/${itemId}/Trickplay/${width}/${tileIndex}.jpg?${params.toString()}`
}
