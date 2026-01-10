/**
 * Subtitle utility functions.
 * Consolidates format detection, time utilities, URL building, and WebGPU detection.
 *
 * @module services/video/subtitle/utils
 */

import type { SubtitleTrackInfo } from '../tracks'
import { buildApiUrl } from '@/services/jellyfin'
import { JELLYFIN_CONFIG, SUBTITLE_CONFIG } from '@/lib/constants'

const { TICKS_PER_SECOND } = JELLYFIN_CONFIG
const { ASS_CODECS, DEFAULT_TARGET_FPS } = SUBTITLE_CONFIG

// ============================================================================
// Format Detection
// ============================================================================

/**
 * Checks if a codec requires JASSUB rendering.
 */
export function isAssCodec(codec: string | undefined): boolean {
  if (!codec) return false
  return ASS_CODECS.includes(codec.toLowerCase() as (typeof ASS_CODECS)[number])
}

/**
 * Checks if a subtitle track requires JASSUB rendering.
 */
export function requiresJassubRenderer(track: SubtitleTrackInfo): boolean {
  const format = track.format.toLowerCase()
  return format === 'ass' || format === 'ssa'
}

// ============================================================================
// Time Utilities
// ============================================================================

/**
 * Calculates the time offset for JASSUB subtitle synchronization.
 * Combines transcoding offset (in ticks) with user offset (in seconds).
 *
 * @param transcodingOffsetTicks - Transcoding offset in ticks (0 for direct play)
 * @param userOffset - User-configured subtitle offset in seconds
 * @returns Combined time offset in seconds
 */
export function calculateTimeOffset(
  transcodingOffsetTicks: number,
  userOffset: number,
): number {
  const transcodingOffsetSeconds = transcodingOffsetTicks / TICKS_PER_SECOND
  return transcodingOffsetSeconds + userOffset
}

/**
 * Media stream interface for frame rate extraction.
 */
interface MediaStreamWithFrameRate {
  Type?: string | null
  ReferenceFrameRate?: number | null
  RealFrameRate?: number | null
  AverageFrameRate?: number | null
}

/**
 * Item interface for frame rate extraction.
 */
interface ItemWithVideoStreams {
  MediaSources?: Array<{
    MediaStreams?: Array<MediaStreamWithFrameRate> | null
  }> | null
}

/**
 * Gets the video stream's reference frame rate for JASSUB targetFps.
 *
 * @param item - Media item containing video stream metadata
 * @returns Video frame rate, or default (24) if not available
 */
export function getVideoFrameRate(
  item: ItemWithVideoStreams | null | undefined,
): number {
  const streams = item?.MediaSources?.[0]?.MediaStreams ?? []
  const videoStream = streams.find((s) => s.Type === 'Video')

  if (!videoStream) return DEFAULT_TARGET_FPS

  const frameRate =
    videoStream.ReferenceFrameRate ??
    videoStream.RealFrameRate ??
    videoStream.AverageFrameRate

  return frameRate && frameRate > 0 ? frameRate : DEFAULT_TARGET_FPS
}

// ============================================================================
// URL Building
// ============================================================================

/**
 * Builds the subtitle URL for a track.
 *
 * @param track - Subtitle track info
 * @param itemId - Media item ID
 * @param serverAddress - Jellyfin server address
 * @param accessToken - Access token for authentication
 * @returns Subtitle URL with authentication
 */
export function getSubtitleUrl(
  track: SubtitleTrackInfo,
  itemId: string,
  serverAddress: string,
  accessToken: string,
): string {
  if (track.deliveryUrl) {
    const endpoint = track.deliveryUrl.startsWith('/')
      ? track.deliveryUrl.slice(1)
      : track.deliveryUrl

    return buildApiUrl({ serverAddress, accessToken, endpoint })
  }

  const mediaSourceId = itemId.replace(/-/g, '')
  const extension = track.format.toLowerCase() === 'ssa' ? 'ssa' : 'ass'

  return buildApiUrl({
    serverAddress,
    accessToken,
    endpoint: `Videos/${itemId}/${mediaSourceId}/Subtitles/${track.index}/Stream.${extension}`,
  })
}

/**
 * Fetches subtitle content from URL.
 *
 * @param url - Subtitle URL to fetch
 * @returns Subtitle content as string
 * @throws Error if fetch fails
 */
export async function fetchSubtitleContent(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch subtitle: ${response.status} ${response.statusText}`,
    )
  }
  return response.text()
}
