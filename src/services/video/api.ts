/**
 * Video API service.
 * Handles video streaming URLs and image URLs for Jellyfin media.
 */

import type { BaseItemDto, ImageType } from '@/types/jellyfin'
import { buildUrl } from '@/services/jellyfin/client'

/**
 * Options for generating a video stream URL.
 */
export interface VideoStreamOptions {
  /** Item ID to stream */
  itemId: string
  /** Container format (e.g., 'ts', 'mp4') */
  container?: string
  /** Audio codec */
  audioCodec?: string
  /** Video codec */
  videoCodec?: string
  /** Maximum streaming bitrate */
  maxStreamingBitrate?: number
  /** Start position in ticks */
  startTimeTicks?: number
  /** Whether to enable transcoding */
  enableTranscoding?: boolean
}

/**
 * Options for generating an image URL.
 */
export interface ImageUrlOptions {
  /** Item ID for the image */
  itemId: string
  /** Image type */
  imageType?: ImageType
  /** Maximum width */
  maxWidth?: number
  /** Maximum height */
  maxHeight?: number
  /** Image quality (0-100) */
  quality?: number
  /** Image tag for cache busting */
  tag?: string
  /** Fill width */
  fillWidth?: number
  /** Fill height */
  fillHeight?: number
}

/**
 * Generates a unique device ID for this browser session.
 * Persists to localStorage so transcoding sessions can be tracked.
 */
function getDeviceId(): string {
  const storageKey = 'segment-editor-device-id'
  let deviceId = localStorage.getItem(storageKey)
  if (!deviceId) {
    deviceId = crypto.randomUUID()
    localStorage.setItem(storageKey, deviceId)
  }
  return deviceId
}

/**
 * Generates an HLS video stream URL for playback.
 * @param options - Video stream options
 * @returns HLS stream URL
 */
export function getVideoStreamUrl(options: VideoStreamOptions): string {
  const {
    itemId,
    container = 'ts',
    audioCodec = 'aac',
    videoCodec = 'h264',
    maxStreamingBitrate = 120000000,
    startTimeTicks = 0,
    enableTranscoding = true,
  } = options

  const query = new URLSearchParams()
  // Required device identification for transcoding
  query.set('DeviceId', getDeviceId())
  // MediaSourceId is the itemId without hyphens
  query.set('MediaSourceId', itemId.replace(/-/g, ''))
  query.set('PlaySessionId', crypto.randomUUID())

  query.set('Container', container)
  query.set('AudioCodec', audioCodec)
  query.set('VideoCodec', videoCodec)
  query.set('MaxStreamingBitrate', String(maxStreamingBitrate))
  query.set('StartTimeTicks', String(startTimeTicks))
  query.set('EnableTranscoding', String(enableTranscoding))
  query.set('TranscodingProtocol', 'hls')
  query.set('TranscodingContainer', 'ts')
  query.set('SegmentContainer', 'ts')
  query.set('MinSegments', '1')
  query.set('BreakOnNonKeyFrames', 'true')

  return buildUrl(`Videos/${itemId}/master.m3u8`, query)
}

/**
 * Generates a direct video stream URL (no transcoding).
 * @param itemId - Item ID to stream
 * @returns Direct stream URL
 */
export function getDirectStreamUrl(itemId: string): string {
  const query = new URLSearchParams()
  query.set('Static', 'true')

  return buildUrl(`Videos/${itemId}/stream`, query)
}

/**
 * Generates an image URL for a media item.
 * @param options - Image URL options
 * @returns Image URL
 */
export function getImageUrl(options: ImageUrlOptions): string {
  const {
    itemId,
    imageType = 'Primary',
    maxWidth,
    maxHeight,
    quality = 90,
    tag,
    fillWidth,
    fillHeight,
  } = options

  const query = new URLSearchParams()
  query.set('quality', String(quality))

  if (maxWidth != null) {
    query.set('maxWidth', String(maxWidth))
  }

  if (maxHeight != null) {
    query.set('maxHeight', String(maxHeight))
  }

  if (fillWidth != null) {
    query.set('fillWidth', String(fillWidth))
  }

  if (fillHeight != null) {
    query.set('fillHeight', String(fillHeight))
  }

  if (tag) {
    query.set('tag', tag)
  }

  return buildUrl(`Items/${itemId}/Images/${imageType}`, query)
}

/**
 * Generates a primary image URL for an item.
 * Convenience function for the most common use case.
 * @param itemId - Item ID
 * @param maxWidth - Maximum width
 * @param maxHeight - Maximum height
 * @returns Primary image URL
 */
export function getPrimaryImageUrl(
  itemId: string,
  maxWidth?: number,
  maxHeight?: number,
): string {
  return getImageUrl({
    itemId,
    imageType: 'Primary',
    maxWidth,
    maxHeight,
  })
}

/**
 * Generates a backdrop image URL for an item.
 * @param itemId - Item ID
 * @param maxWidth - Maximum width
 * @returns Backdrop image URL
 */
export function getBackdropImageUrl(itemId: string, maxWidth?: number): string {
  return getImageUrl({
    itemId,
    imageType: 'Backdrop',
    maxWidth,
  })
}

/**
 * Generates a thumbnail image URL for an item.
 * @param itemId - Item ID
 * @param maxWidth - Maximum width
 * @param maxHeight - Maximum height
 * @returns Thumbnail image URL
 */
export function getThumbnailImageUrl(
  itemId: string,
  maxWidth?: number,
  maxHeight?: number,
): string {
  return getImageUrl({
    itemId,
    imageType: 'Thumb',
    maxWidth,
    maxHeight,
  })
}

/**
 * Gets the best available image URL for an item.
 * Tries primary image first, then falls back to other types.
 * @param item - Base item with image tags
 * @param maxWidth - Maximum width
 * @param maxHeight - Maximum height
 * @returns Best available image URL or undefined
 */
export function getBestImageUrl(
  item: BaseItemDto,
  maxWidth?: number,
  maxHeight?: number,
): string | undefined {
  if (!item.Id) {
    return undefined
  }

  // Try primary image first
  if (item.ImageTags?.Primary) {
    return getImageUrl({
      itemId: item.Id,
      imageType: 'Primary',
      maxWidth,
      maxHeight,
      tag: item.ImageTags.Primary,
    })
  }

  // Try backdrop
  if (item.BackdropImageTags && item.BackdropImageTags.length > 0) {
    return getImageUrl({
      itemId: item.Id,
      imageType: 'Backdrop',
      maxWidth,
      maxHeight,
      tag: item.BackdropImageTags[0],
    })
  }

  // Try thumb
  if (item.ImageTags?.Thumb) {
    return getImageUrl({
      itemId: item.Id,
      imageType: 'Thumb',
      maxWidth,
      maxHeight,
      tag: item.ImageTags.Thumb,
    })
  }

  // Try parent images for episodes
  if (item.ParentThumbItemId) {
    return getImageUrl({
      itemId: item.ParentThumbItemId,
      imageType: 'Thumb',
      maxWidth,
      maxHeight,
    })
  }

  if (item.SeriesId && item.SeriesPrimaryImageTag) {
    return getImageUrl({
      itemId: item.SeriesId,
      imageType: 'Primary',
      maxWidth,
      maxHeight,
      tag: item.SeriesPrimaryImageTag,
    })
  }

  return undefined
}

/**
 * Gets the blurhash for an item's primary image.
 * @param item - Base item with image blur hashes
 * @returns Blurhash string or undefined
 */
export function getImageBlurhash(item: BaseItemDto): string | undefined {
  if (item.ImageBlurHashes?.Primary) {
    // Get the first available blurhash
    const hashes = item.ImageBlurHashes.Primary
    const keys = Object.keys(hashes)
    if (keys.length > 0) {
      return hashes[keys[0]]
    }
  }
  return undefined
}
