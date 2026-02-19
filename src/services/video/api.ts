/**
 * Video API service.
 * Handles video streaming URLs and image URLs for Jellyfin media.
 */

import type { BaseItemDto, ImageType } from '@/types/jellyfin'
import type { MediaSourceInfo } from '@/services/video/compatibility'
import { JELLYFIN_CONFIG } from '@/lib/constants'
import { buildApiUrl, getCredentials, getDeviceId } from '@/services/jellyfin'
import { checkCompatibility } from '@/services/video/compatibility'
import { getActivePlaySessionId } from '@/services/video/playback-session'
import { generateUUID } from '@/lib/segment-utils'

// ============================================================================
// Types
// ============================================================================

interface VideoStreamOptions {
  itemId: string
  container?: string
  audioCodec?: string
  maxStreamingBitrate?: number
  startTimeTicks?: number
}

/**
 * Options for generating a direct play URL.
 */
interface DirectPlayOptions {
  itemId: string
  mediaSourceId?: string
  startTimeTicks?: number
  container?: string
}

/**
 * Playback strategy type.
 */
export type PlaybackStrategy = 'direct' | 'hls'

/**
 * Configuration for video playback.
 */
interface PlaybackConfig {
  strategy: PlaybackStrategy
  url: string
  startTime?: number
}

interface ImageUrlOptions {
  itemId: string
  imageType?: ImageType
  maxWidth?: number
  maxHeight?: number
  quality?: number
  tag?: string
  fillWidth?: number
  fillHeight?: number
}

// ============================================================================
// URL Building Helpers
// ============================================================================

function buildUrl(endpoint: string, query: URLSearchParams): string {
  const creds = getCredentials()
  return buildApiUrl({
    serverAddress: creds.serverAddress,
    accessToken: creds.accessToken,
    endpoint,
    query,
  })
}

// ============================================================================
// Direct Play URL Generation
// ============================================================================

/**
 * Generates a direct play URL for a video item.
 * Uses the static stream endpoint format `/Videos/{itemId}/stream`.
 *
 * @param options - Direct play options including itemId and optional parameters
 * @returns The direct play URL with authentication parameters
 */
export function getDirectPlayUrl(options: DirectPlayOptions): string {
  const { itemId, mediaSourceId, startTimeTicks, container } = options

  const query = new URLSearchParams({
    DeviceId: getDeviceId(),
    Static: 'true',
  })

  // Use mediaSourceId if provided, otherwise use itemId without dashes
  if (mediaSourceId) {
    query.set('MediaSourceId', mediaSourceId)
  } else {
    query.set('MediaSourceId', itemId.replace(/-/g, ''))
  }

  // Add optional StartTimeTicks parameter
  if (startTimeTicks !== undefined && startTimeTicks > 0) {
    query.set('StartTimeTicks', String(startTimeTicks))
  }

  // Add optional container parameter
  if (container) {
    query.set('Container', container)
  }

  return buildUrl(`Videos/${itemId}/stream`, query)
}

// ============================================================================
// HLS Stream URL Generation
// ============================================================================

/**
 * Generates an HLS streaming URL for a video item.
 * Uses transcoding with the master.m3u8 endpoint.
 *
 * @param options - Video stream options
 * @param audioStreamIndex - Optional audio stream index to select specific audio track
 */
export function getVideoStreamUrl(
  options: VideoStreamOptions,
  audioStreamIndex?: number,
): string {
  const {
    itemId,
    container = 'mp4',
    audioCodec = 'aac',
    maxStreamingBitrate = 140000000,
    startTimeTicks = 0,
  } = options

  // Use active session's PlaySessionId if available, otherwise generate new one
  const playSessionId = getActivePlaySessionId() ?? generateUUID()

  const query = new URLSearchParams({
    DeviceId: getDeviceId(),
    MediaSourceId: itemId.replace(/-/g, ''),
    PlaySessionId: playSessionId,
    VideoCodec: 'av1,hevc,h264,vp9',
    AudioCodec: audioCodec,
    VideoBitrate: String(maxStreamingBitrate),
    AudioBitrate: '384000',
    AudioSampleRate: '48000',
    MaxStreamingBitrate: String(maxStreamingBitrate),
    StartTimeTicks: String(startTimeTicks),
    TranscodingProtocol: 'hls',
    SegmentContainer: container,
    MinSegments: '1',
    BreakOnNonKeyFrames: 'True',
    RequireAvc: 'false',
    EnableAudioVbrEncoding: 'true',
    TranscodingMaxAudioChannels: '6',
    'h264-profile': 'high',
    'h264-level': '51',
    'hevc-profile': 'main,main10',
    'hevc-level': '186',
    'av1-profile': 'main',
  })

  // Add audio stream index if specified (for selecting specific audio track)
  if (audioStreamIndex !== undefined) {
    query.set('AudioStreamIndex', String(audioStreamIndex))
  }

  return buildUrl(`Videos/${itemId}/master.m3u8`, query)
}

function getImageUrl(options: ImageUrlOptions): string {
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

  const query = new URLSearchParams({ quality: String(quality) })
  if (maxWidth != null) query.set('maxWidth', String(maxWidth))
  if (maxHeight != null) query.set('maxHeight', String(maxHeight))
  if (fillWidth != null) query.set('fillWidth', String(fillWidth))
  if (fillHeight != null) query.set('fillHeight', String(fillHeight))
  if (tag) query.set('tag', tag)

  return buildUrl(`Items/${itemId}/Images/${imageType}`, query)
}

type ImageCandidate = { itemId: string; imageType: ImageType; tag?: string }

const IMAGE_URL_CACHE_MAX_SIZE = 2000
const imageUrlCache = new Map<string, string | null>()

function setImageUrlCache(cacheKey: string, value: string | null): void {
  if (imageUrlCache.has(cacheKey)) {
    imageUrlCache.delete(cacheKey)
  } else if (imageUrlCache.size >= IMAGE_URL_CACHE_MAX_SIZE) {
    const firstKey = imageUrlCache.keys().next().value
    if (firstKey) {
      imageUrlCache.delete(firstKey)
    }
  }

  imageUrlCache.set(cacheKey, value)
}

function getImageCacheKey(
  item: BaseItemDto,
  maxWidth?: number,
  maxHeight?: number,
): string {
  return [
    item.Id ?? '',
    maxWidth ?? '',
    maxHeight ?? '',
    item.ImageTags?.Primary ?? '',
    item.ImageTags?.Thumb ?? '',
    item.BackdropImageTags?.[0] ?? '',
    item.ParentThumbItemId ?? '',
    item.SeriesId ?? '',
    item.SeriesPrimaryImageTag ?? '',
  ].join('|')
}

export function getBestImageUrl(
  item: BaseItemDto,
  maxWidth?: number,
  maxHeight?: number,
): string | undefined {
  if (!item.Id) return undefined

  const cacheKey = getImageCacheKey(item, maxWidth, maxHeight)
  const cached = imageUrlCache.get(cacheKey)
  if (cached !== undefined) {
    return cached ?? undefined
  }

  const candidates: Array<ImageCandidate | null> = [
    item.ImageTags?.Primary
      ? { itemId: item.Id, imageType: 'Primary', tag: item.ImageTags.Primary }
      : null,
    item.BackdropImageTags?.[0]
      ? {
          itemId: item.Id,
          imageType: 'Backdrop',
          tag: item.BackdropImageTags[0],
        }
      : null,
    item.ImageTags?.Thumb
      ? { itemId: item.Id, imageType: 'Thumb', tag: item.ImageTags.Thumb }
      : null,
    item.ParentThumbItemId
      ? { itemId: item.ParentThumbItemId, imageType: 'Thumb' }
      : null,
    item.SeriesId && item.SeriesPrimaryImageTag
      ? {
          itemId: item.SeriesId,
          imageType: 'Primary',
          tag: item.SeriesPrimaryImageTag,
        }
      : null,
  ]

  for (const c of candidates) {
    if (c) {
      const url = getImageUrl({
        itemId: c.itemId,
        imageType: c.imageType,
        maxWidth,
        maxHeight,
        tag: c.tag,
      })
      if (url) {
        setImageUrlCache(cacheKey, url)
        return url
      }
    }
  }

  setImageUrlCache(cacheKey, null)
  return undefined
}

export function getImageBlurhash(item: BaseItemDto): string | undefined {
  const hashes = item.ImageBlurHashes?.Primary
  return hashes ? Object.values(hashes)[0] : undefined
}

// ============================================================================
// Playback Configuration
// ============================================================================

/**
 * Extracts media source information from a Jellyfin item.
 * Returns null if media source info is unavailable.
 */
export function extractMediaSourceInfo(
  item: BaseItemDto,
): MediaSourceInfo | null {
  const mediaSources = item.MediaSources
  if (!mediaSources || mediaSources.length === 0) {
    return null
  }

  const source = mediaSources[0]
  const mediaStreams = source.MediaStreams ?? []

  // Find video and audio streams
  const videoStream = mediaStreams.find((s) => s.Type === 'Video')
  const audioStream = mediaStreams.find((s) => s.Type === 'Audio')

  const container = source.Container ?? ''
  const videoCodec = videoStream?.Codec ?? ''
  const audioCodec = audioStream?.Codec ?? ''

  // Return null if essential info is missing
  if (!container || !videoCodec) {
    return null
  }

  return {
    container,
    videoCodec,
    audioCodec,
    bitrate: source.Bitrate ?? undefined,
  }
}

/**
 * Gets the playback configuration for a video item.
 * Determines whether to use direct play or HLS based on compatibility.
 *
 * If a non-default audio track is requested (audioStreamIndex provided and not
 * matching the first audio track), HLS transcoding is used since most browsers
 * don't support audio track switching in direct play mode.
 *
 * @param item - The Jellyfin item to get playback config for
 * @param startTimeTicks - Optional start time in ticks
 * @param audioStreamIndex - Optional audio stream index for track selection
 * @returns PlaybackConfig with strategy and appropriate URL
 */
export async function getPlaybackConfig(
  item: BaseItemDto,
  startTimeTicks?: number,
  audioStreamIndex?: number,
): Promise<PlaybackConfig> {
  if (!item.Id) {
    // No item ID, fall back to HLS (though this shouldn't happen)
    return {
      strategy: 'hls',
      url: '',
      startTime: startTimeTicks
        ? startTimeTicks / JELLYFIN_CONFIG.TICKS_PER_SECOND
        : undefined,
    }
  }

  // Extract media source info from item
  const mediaSourceInfo = extractMediaSourceInfo(item)

  // Check compatibility
  const compatibility = await checkCompatibility(mediaSourceInfo)

  // Get container from media source if available
  const container = mediaSourceInfo?.container

  // Check if a non-first audio track is requested
  // If so, we need HLS transcoding since browsers don't support audio track switching in direct play
  const needsNonDefaultAudio =
    audioStreamIndex !== undefined &&
    isNonFirstAudioTrack(item, audioStreamIndex)

  if (compatibility.canDirectPlay && !needsNonDefaultAudio) {
    // Use direct play (only when using first/default audio track)
    const url = getDirectPlayUrl({
      itemId: item.Id,
      startTimeTicks,
      container,
    })

    return {
      strategy: 'direct',
      url,
      startTime: startTimeTicks
        ? startTimeTicks / JELLYFIN_CONFIG.TICKS_PER_SECOND
        : undefined,
    }
  }

  // Fall back to HLS with optional audio stream index
  const url = getVideoStreamUrl(
    {
      itemId: item.Id,
      startTimeTicks,
    },
    audioStreamIndex,
  )

  return {
    strategy: 'hls',
    url,
    startTime: startTimeTicks
      ? startTimeTicks / JELLYFIN_CONFIG.TICKS_PER_SECOND
      : undefined,
  }
}

/**
 * Checks if the given audio stream index is NOT the first audio track.
 * Used to determine if we need HLS transcoding for audio track selection.
 */
function isNonFirstAudioTrack(
  item: BaseItemDto,
  audioStreamIndex: number,
): boolean {
  const mediaSources = item.MediaSources
  if (!mediaSources || mediaSources.length === 0) {
    return false
  }

  const mediaStreams = mediaSources[0].MediaStreams ?? []

  // Find the first audio stream
  const firstAudioStream = mediaStreams.find((s) => s.Type === 'Audio')

  if (!firstAudioStream) {
    return false
  }

  // If the requested index doesn't match the first audio stream's index, it's non-first
  return firstAudioStream.Index !== audioStreamIndex
}
