/**
 * Video compatibility checker service.
 * Determines whether a video can be played directly based on browser capabilities
 * and media source properties, with automatic fallback to HLS transcoding.
 *
 * @module services/video/compatibility
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Media source information extracted from Jellyfin item metadata.
 */
export interface MediaSourceInfo {
  container: string
  videoCodec: string
  audioCodec: string
  bitrate?: number
}

/**
 * Result of compatibility check.
 */
export interface CompatibilityResult {
  canDirectPlay: boolean
  reason?: string
}

/**
 * Cached codec capability information.
 */
interface CodecCapability {
  supported: boolean
  smooth: boolean
  powerEfficient: boolean
  timestamp: number
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Supported container formats for direct play.
 */
export const DIRECT_PLAY_CONTAINERS = ['mp4', 'mkv', 'webm'] as const

/**
 * Supported video codecs for direct play.
 */
export const DIRECT_PLAY_VIDEO_CODECS = [
  'h264',
  'hevc',
  'h265',
  'vp9',
  'av1',
] as const

/**
 * Supported audio codecs for direct play.
 */
export const DIRECT_PLAY_AUDIO_CODECS = [
  'aac',
  'mp3',
  'opus',
  'flac',
  'ac3',
] as const

export type DirectPlayContainer = (typeof DIRECT_PLAY_CONTAINERS)[number]
export type DirectPlayVideoCodec = (typeof DIRECT_PLAY_VIDEO_CODECS)[number]
export type DirectPlayAudioCodec = (typeof DIRECT_PLAY_AUDIO_CODECS)[number]

// ============================================================================
// Capability Cache
// ============================================================================

/**
 * Cache for browser codec capability results.
 * Key format: `${type}:${codec}` (e.g., "video:h264", "audio:aac")
 */
const capabilityCache: Map<string, CodecCapability> = new Map()

/**
 * Clears the capability cache.
 * Useful for testing or when browser capabilities may have changed.
 */
export function clearCache(): void {
  capabilityCache.clear()
}

/**
 * Gets the current cache size (for testing purposes).
 */
export function getCacheSize(): number {
  return capabilityCache.size
}

// ============================================================================
// Browser Capability Detection
// ============================================================================

/**
 * Maps codec names to MIME type strings for MediaCapabilities API.
 */
const VIDEO_CODEC_MIME_MAP: Record<string, string> = {
  h264: 'video/mp4; codecs="avc1.640028"',
  hevc: 'video/mp4; codecs="hvc1.1.6.L93.B0"',
  h265: 'video/mp4; codecs="hvc1.1.6.L93.B0"',
  vp9: 'video/webm; codecs="vp9"',
  av1: 'video/mp4; codecs="av01.0.08M.08"',
}

const AUDIO_CODEC_MIME_MAP: Record<string, string> = {
  aac: 'audio/mp4; codecs="mp4a.40.2"',
  mp3: 'audio/mpeg',
  opus: 'audio/webm; codecs="opus"',
  flac: 'audio/flac',
  ac3: 'audio/mp4; codecs="ac-3"',
}

/**
 * Detects if the browser is Safari (for native HLS handling).
 */
function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /Safari/.test(ua) && !/Chrome/.test(ua) && !/Chromium/.test(ua)
}

/**
 * Checks codec support using the canPlayType fallback method.
 * Used when MediaCapabilities API is unavailable.
 */
function canPlayTypeFallback(codec: string, type: 'video' | 'audio'): boolean {
  if (typeof document === 'undefined') return false

  const mimeMap = type === 'video' ? VIDEO_CODEC_MIME_MAP : AUDIO_CODEC_MIME_MAP
  const mime = mimeMap[codec.toLowerCase()]
  if (!mime) return false

  const video = document.createElement('video')
  const result = video.canPlayType(mime)
  return result === 'probably' || result === 'maybe'
}

/**
 * Checks if a codec is supported using the MediaCapabilities API.
 * Falls back to canPlayType if MediaCapabilities is unavailable.
 *
 * Results are cached to avoid repeated browser API calls.
 *
 * @param codec - The codec name (e.g., "h264", "aac")
 * @param type - Whether this is a video or audio codec
 * @returns Promise resolving to whether the codec is supported
 */
export async function isCodecSupported(
  codec: string,
  type: 'video' | 'audio',
): Promise<boolean> {
  const normalizedCodec = codec.toLowerCase()
  const cacheKey = `${type}:${normalizedCodec}`

  // Check cache first
  const cached = capabilityCache.get(cacheKey)
  if (cached !== undefined) {
    return cached.supported
  }

  // Safari handles HLS natively, so we can be more permissive
  if (isSafari() && type === 'video') {
    const capability: CodecCapability = {
      supported: true,
      smooth: true,
      powerEfficient: true,
      timestamp: Date.now(),
    }
    capabilityCache.set(cacheKey, capability)
    return true
  }

  const mimeMap = type === 'video' ? VIDEO_CODEC_MIME_MAP : AUDIO_CODEC_MIME_MAP
  const mime = mimeMap[normalizedCodec]

  if (!mime) {
    const capability: CodecCapability = {
      supported: false,
      smooth: false,
      powerEfficient: false,
      timestamp: Date.now(),
    }
    capabilityCache.set(cacheKey, capability)
    return false
  }

  // Try MediaCapabilities API first
  if (typeof navigator !== 'undefined' && 'mediaCapabilities' in navigator) {
    try {
      const config =
        type === 'video'
          ? {
              type: 'file' as const,
              video: {
                contentType: mime,
                width: 1920,
                height: 1080,
                bitrate: 10_000_000,
                framerate: 30,
              },
            }
          : {
              type: 'file' as const,
              audio: {
                contentType: mime,
                channels: '2',
                bitrate: 128_000,
                samplerate: 48000,
              },
            }

      const result = await navigator.mediaCapabilities.decodingInfo(config)
      const capability: CodecCapability = {
        supported: result.supported,
        smooth: result.smooth,
        powerEfficient: result.powerEfficient,
        timestamp: Date.now(),
      }
      capabilityCache.set(cacheKey, capability)
      return result.supported
    } catch {
      // Fall through to canPlayType fallback
    }
  }

  // Fallback to canPlayType
  const supported = canPlayTypeFallback(normalizedCodec, type)
  const capability: CodecCapability = {
    supported,
    smooth: false,
    powerEfficient: false,
    timestamp: Date.now(),
  }
  capabilityCache.set(cacheKey, capability)
  return supported
}

// ============================================================================
// Compatibility Checking
// ============================================================================

/**
 * Checks if a container format is supported for direct play.
 */
function isContainerSupported(container: string): boolean {
  const normalized = container.toLowerCase()
  return (DIRECT_PLAY_CONTAINERS as ReadonlyArray<string>).includes(normalized)
}

/**
 * Checks if a video codec is in the supported list.
 */
function isVideoCodecInList(codec: string): boolean {
  const normalized = codec.toLowerCase()
  return (DIRECT_PLAY_VIDEO_CODECS as ReadonlyArray<string>).includes(
    normalized,
  )
}

/**
 * Checks if an audio codec is in the supported list.
 */
function isAudioCodecInList(codec: string): boolean {
  const normalized = codec.toLowerCase()
  return (DIRECT_PLAY_AUDIO_CODECS as ReadonlyArray<string>).includes(
    normalized,
  )
}

/**
 * Checks if a video can be played directly based on browser capabilities
 * and media source properties.
 *
 * The check follows this order:
 * 1. Container format compatibility
 * 2. Video codec compatibility (both in list and browser support)
 * 3. Audio codec compatibility (both in list and browser support)
 *
 * @param mediaSource - Media source information from Jellyfin
 * @returns Promise resolving to compatibility result
 */
export async function checkCompatibility(
  mediaSource: MediaSourceInfo | null | undefined,
): Promise<CompatibilityResult> {
  // Handle missing media source info
  if (!mediaSource) {
    return {
      canDirectPlay: false,
      reason: 'Media source information unavailable',
    }
  }

  const { container, videoCodec, audioCodec } = mediaSource

  // Check container compatibility
  if (!container || !isContainerSupported(container)) {
    return {
      canDirectPlay: false,
      reason: `Unsupported container format: ${container || 'unknown'}`,
    }
  }

  // Check video codec is in supported list
  if (!videoCodec || !isVideoCodecInList(videoCodec)) {
    return {
      canDirectPlay: false,
      reason: `Unsupported video codec: ${videoCodec || 'unknown'}`,
    }
  }

  // Check browser support for video codec
  const videoSupported = await isCodecSupported(videoCodec, 'video')
  if (!videoSupported) {
    return {
      canDirectPlay: false,
      reason: `Browser does not support video codec: ${videoCodec}`,
    }
  }

  // Check audio codec is in supported list
  if (!audioCodec || !isAudioCodecInList(audioCodec)) {
    return {
      canDirectPlay: false,
      reason: `Unsupported audio codec: ${audioCodec || 'unknown'}`,
    }
  }

  // Check browser support for audio codec
  const audioSupported = await isCodecSupported(audioCodec, 'audio')
  if (!audioSupported) {
    return {
      canDirectPlay: false,
      reason: `Browser does not support audio codec: ${audioCodec}`,
    }
  }

  return { canDirectPlay: true }
}
