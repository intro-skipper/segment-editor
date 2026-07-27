/**
 * Video compatibility checker service.
 * Determines whether a video can be played directly based on browser capabilities
 * and media source properties, with automatic fallback to HLS transcoding.
 *
 * @module services/video/compatibility
 */

import {
  clearCapabilityProbeCache,
  isFirefox,
  isSafari,
  probeCanPlayType,
} from '@/services/video/capabilities'

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Video stream metadata used to build precise codec strings and decoding configs.
 * Every field is optional: Jellyfin does not always report full stream details.
 */
export interface VideoStreamInfo {
  codec: string
  /** Codec profile as reported by Jellyfin (e.g. "High", "Main 10") */
  profile?: string
  /** Codec level as reported by Jellyfin (e.g. 41 or 4.1 for H.264 level 4.1) */
  level?: number
  width?: number
  height?: number
  bitrate?: number
  /** Bits per sample (8, 10, 12) */
  bitDepth?: number
  /** Dynamic range as reported by Jellyfin (e.g. "SDR", "HDR") */
  videoRange?: string
  /** Frames per second (average, falling back to the real frame rate) */
  frameRate?: number
}

/**
 * Audio stream metadata for a single audio track of a media source.
 */
export interface AudioStreamInfo {
  /** Jellyfin MediaStream index (includes all stream types) */
  index: number
  codec: string
  channels?: number
}

/**
 * Media source information extracted from Jellyfin item metadata.
 *
 * `videoCodec`/`audioCodec` stay the primary-stream codecs for backwards
 * compatibility; `video`/`audioStreams` carry the richer metadata when available.
 */
export interface MediaSourceInfo {
  container: string
  videoCodec: string
  audioCodec: string
  bitrate?: number
  /** Full metadata of the primary video stream */
  video?: VideoStreamInfo
  /** All audio streams of the media source, in MediaStream order */
  audioStreams?: Array<AudioStreamInfo>
}

/**
 * Result of compatibility check.
 */
interface CompatibilityResult {
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

/**
 * Optional stream metadata used to refine a codec capability query.
 */
export interface CodecCapabilityHints {
  /** Video stream metadata (video codecs only) */
  video?: VideoStreamInfo
  /** Channel count of the audio stream (audio codecs only) */
  channels?: number
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Container formats that are candidates for direct play.
 * Actual support is feature detected per browser, see
 * {@link isDirectPlayContainerSupported}.
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
  'eac3',
] as const

/** MIME type probed to detect Matroska direct play support. */
const MATROSKA_MIME_TYPE = 'video/x-matroska'

/** Decoding config defaults used when the media source lacks metadata. */
const DEFAULT_VIDEO_WIDTH = 1920
const DEFAULT_VIDEO_HEIGHT = 1080
const DEFAULT_VIDEO_BITRATE = 10_000_000
const DEFAULT_VIDEO_FRAMERATE = 30
const DEFAULT_AUDIO_CHANNELS = 2
const DEFAULT_AUDIO_BITRATE = 128_000
const DEFAULT_AUDIO_SAMPLERATE = 48_000

// ============================================================================
// Capability Cache
// ============================================================================

/**
 * Cache for browser codec capability results.
 * Key format: `${type}:${contentType}:${configSignature}`
 */
const capabilityCache: Map<string, CodecCapability> = new Map()

/**
 * Clears the capability cache.
 * Useful for testing or when browser capabilities may have changed.
 */
export function clearCache(): void {
  capabilityCache.clear()
  clearCapabilityProbeCache()
}

/**
 * Gets the current cache size (for testing purposes).
 */
export function getCacheSize(): number {
  return capabilityCache.size
}

// ============================================================================
// Codec String Builders
// ============================================================================

/**
 * H.264 profile_idc values keyed by the profile name Jellyfin reports.
 */
const H264_PROFILE_IDS: Record<string, string> = {
  baseline: '42',
  'constrained baseline': '42',
  main: '4D',
  high: '64',
}

/** profile_idc used when the media source does not report a profile. */
const DEFAULT_H264_PROFILE_ID = '64'
/** level_idc (hex) used when the media source does not report a level. */
const DEFAULT_H264_LEVEL_ID = '28'

/** VP9 profile ids keyed by the profile name Jellyfin reports. */
const VP9_PROFILE_IDS: Record<string, string> = {
  'profile 0': '00',
  'profile 1': '01',
  'profile 2': '02',
  'profile 3': '03',
}

const DEFAULT_VP9_PROFILE_ID = '00'
const DEFAULT_VP9_LEVEL_ID = '10'
const DEFAULT_HEVC_LEVEL_ID = 123
const DEFAULT_AV1_SEQ_LEVEL = 8
/** Highest valid AV1 seq_level_idx. */
const MAX_AV1_SEQ_LEVEL = 23

function isPositiveNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0
}

/**
 * Normalizes a level reported as either `4.1` or `41` into the ×10 integer
 * form used by the `avc1`/`vp09` codec strings. Jellyfin reports both shapes
 * depending on the probing backend.
 */
function normalizeDecimalLevel(level: number | undefined): number | undefined {
  if (!isPositiveNumber(level)) return undefined
  return level < 10 ? Math.round(level * 10) : Math.round(level)
}

function toHexByte(value: number): string {
  return Math.max(0, Math.round(value))
    .toString(16)
    .toUpperCase()
    .padStart(2, '0')
}

/**
 * Builds an `avc1.PPCCLL` codec string from H.264 stream metadata.
 *
 * @param profile - Jellyfin profile name (Baseline/Main/High), defaults to High
 * @param level - Jellyfin level (4.1 or 41), defaults to level 4.0
 * @returns Codec string such as `avc1.640029` for High\@4.1
 */
export function buildH264CodecString(profile?: string, level?: number): string {
  const profileId =
    H264_PROFILE_IDS[profile?.trim().toLowerCase() ?? ''] ??
    DEFAULT_H264_PROFILE_ID
  const normalizedLevel = normalizeDecimalLevel(level)
  const levelId =
    normalizedLevel === undefined
      ? DEFAULT_H264_LEVEL_ID
      : toHexByte(normalizedLevel)

  return `avc1.${profileId}00${levelId}`
}

/**
 * Normalizes an HEVC level reported as either `4.1` or `123` into the
 * general_level_idc (level ×30) used by the `hvc1` codec string.
 */
function normalizeHevcLevelId(level: number | undefined): number {
  if (!isPositiveNumber(level)) return DEFAULT_HEVC_LEVEL_ID
  return level > 30 ? Math.round(level) : Math.round(level * 30)
}

/**
 * Builds an `hvc1.P.C.L<level>.B0` codec string from HEVC stream metadata.
 *
 * @param profile - Jellyfin profile name (Main, Main 10), defaults to Main
 * @param level - Jellyfin level (4.1 or 123), defaults to L123
 * @returns Codec string such as `hvc1.2.4.L123.B0` for Main 10\@4.1
 */
export function buildHevcCodecString(profile?: string, level?: number): string {
  const normalizedProfile = profile?.trim().toLowerCase() ?? ''
  const isMain10 =
    normalizedProfile.includes('main 10') ||
    normalizedProfile.includes('main10')
  const profilePrefix = isMain10 ? 'hvc1.2.4' : 'hvc1.1.6'

  return `${profilePrefix}.L${normalizeHevcLevelId(level)}.B0`
}

/**
 * Normalizes an AV1 level into a seq_level_idx.
 *
 * FFmpeg (and therefore Jellyfin) reports the raw seq_level_idx as an integer;
 * a `major.minor` value is converted with `(major - 2) * 4 + minor`.
 */
function normalizeAv1SeqLevel(level: number | undefined): number {
  if (level === undefined || !Number.isFinite(level) || level < 0) {
    return DEFAULT_AV1_SEQ_LEVEL
  }

  if (Number.isInteger(level)) {
    return level <= MAX_AV1_SEQ_LEVEL ? level : DEFAULT_AV1_SEQ_LEVEL
  }

  const major = Math.floor(level)
  const minor = Math.round((level - major) * 10)
  const seqLevel = (major - 2) * 4 + minor

  return seqLevel >= 0 && seqLevel <= MAX_AV1_SEQ_LEVEL
    ? seqLevel
    : DEFAULT_AV1_SEQ_LEVEL
}

/**
 * Builds an `av01.0.<seq level>M.<bit depth>` codec string from AV1 metadata.
 *
 * @param level - Jellyfin level (seq_level_idx or major.minor), defaults to 8
 * @param bitDepth - Bits per sample, 10+ selects the 10-bit codec string
 */
export function buildAv1CodecString(level?: number, bitDepth?: number): string {
  const seqLevel = String(normalizeAv1SeqLevel(level)).padStart(2, '0')
  const depth = isPositiveNumber(bitDepth) && bitDepth >= 10 ? '10' : '08'

  return `av01.0.${seqLevel}M.${depth}`
}

/**
 * Builds a `vp09.PP.LL.DD` codec string from VP9 stream metadata.
 *
 * @param profile - Jellyfin profile name ("Profile 0"), defaults to profile 0
 * @param level - Jellyfin level (4.1 or 41), defaults to level 1.0
 * @param bitDepth - Bits per sample, defaults to 8
 */
export function buildVp9CodecString(
  profile?: string,
  level?: number,
  bitDepth?: number,
): string {
  const profileId =
    VP9_PROFILE_IDS[profile?.trim().toLowerCase() ?? ''] ??
    DEFAULT_VP9_PROFILE_ID
  const normalizedLevel = normalizeDecimalLevel(level)
  const levelId =
    normalizedLevel === undefined
      ? DEFAULT_VP9_LEVEL_ID
      : String(normalizedLevel).padStart(2, '0')
  const depth = isPositiveNumber(bitDepth) && bitDepth >= 10 ? '10' : '08'

  return `vp09.${profileId}.${levelId}.${depth}`
}

/**
 * Builds the MediaCapabilities/`canPlayType` content type for a video codec,
 * deriving the codec string from the real stream metadata when available.
 *
 * @returns The content type, or null when the codec is not direct playable
 */
export function buildVideoContentType(
  codec: string,
  video?: VideoStreamInfo,
): string | null {
  switch (codec.toLowerCase()) {
    case 'h264':
      return `video/mp4; codecs="${buildH264CodecString(video?.profile, video?.level)}"`
    case 'hevc':
    case 'h265':
      return `video/mp4; codecs="${buildHevcCodecString(video?.profile, video?.level)}"`
    case 'av1':
      return `video/mp4; codecs="${buildAv1CodecString(video?.level, video?.bitDepth)}"`
    case 'vp9':
      return `video/webm; codecs="${buildVp9CodecString(video?.profile, video?.level, video?.bitDepth)}"`
    default:
      return null
  }
}

/**
 * Content types for the supported audio codecs.
 */
const AUDIO_CODEC_MIME_MAP: Record<string, string> = {
  aac: 'audio/mp4; codecs="mp4a.40.2"',
  mp3: 'audio/mpeg',
  opus: 'audio/webm; codecs="opus"',
  flac: 'audio/flac',
  ac3: 'audio/mp4; codecs="ac-3"',
  eac3: 'audio/mp4; codecs="ec-3"',
}

/**
 * Builds the MediaCapabilities/`canPlayType` content type for an audio codec.
 *
 * @returns The content type, or null when the codec is not direct playable
 */
export function buildAudioContentType(codec: string): string | null {
  return AUDIO_CODEC_MIME_MAP[codec.toLowerCase()] ?? null
}

// ============================================================================
// Browser Capability Detection
// ============================================================================

/**
 * Returns supported direct-play containers for the current browser.
 */
export function getDirectPlayContainers(): ReadonlyArray<string> {
  return DIRECT_PLAY_CONTAINERS.filter(isDirectPlayContainerSupported)
}

/**
 * Checks if a container is supported for direct play in the current browser.
 *
 * MKV is feature detected instead of assumed: Chromium only recognizes
 * `video/x-matroska` from version 145 onwards (older builds return `''` and
 * must transcode).
 */
export function isDirectPlayContainerSupported(container: string): boolean {
  const normalized = container.toLowerCase()

  if (!(DIRECT_PLAY_CONTAINERS as ReadonlyArray<string>).includes(normalized)) {
    return false
  }

  if (normalized === 'mkv') {
    // Firefox 145+ plays MKV, but any MKV with a supported audio track is
    // buffered in full before playback starts (Bugzilla 2000420, unfixed),
    // so MKV direct play stays disabled there.
    if (isFirefox()) return false
    return probeCanPlayType(MATROSKA_MIME_TYPE) !== ''
  }

  return true
}

function clampNumber(value: number | undefined, fallback: number): number {
  return isPositiveNumber(value) ? value : fallback
}

function buildVideoDecodingConfig(
  contentType: string,
  video?: VideoStreamInfo,
) {
  return {
    contentType,
    width: Math.round(clampNumber(video?.width, DEFAULT_VIDEO_WIDTH)),
    height: Math.round(clampNumber(video?.height, DEFAULT_VIDEO_HEIGHT)),
    bitrate: Math.round(clampNumber(video?.bitrate, DEFAULT_VIDEO_BITRATE)),
    framerate: clampNumber(video?.frameRate, DEFAULT_VIDEO_FRAMERATE),
  }
}

function buildAudioDecodingConfig(contentType: string, channels?: number) {
  return {
    contentType,
    channels: String(Math.round(clampNumber(channels, DEFAULT_AUDIO_CHANNELS))),
    bitrate: DEFAULT_AUDIO_BITRATE,
    samplerate: DEFAULT_AUDIO_SAMPLERATE,
  }
}

/**
 * Builds a stable cache key for a codec capability query.
 * Different stream metadata must not share a cached answer.
 */
function getCapabilityCacheKey(
  type: 'video' | 'audio',
  contentType: string,
  hints: CodecCapabilityHints | undefined,
): string {
  if (type === 'video') {
    const config = buildVideoDecodingConfig(contentType, hints?.video)
    return `video:${contentType}:${config.width}x${config.height}@${config.bitrate}/${config.framerate}`
  }

  const config = buildAudioDecodingConfig(contentType, hints?.channels)
  return `audio:${contentType}:${config.channels}ch`
}

/**
 * Checks codec support using the canPlayType fallback method.
 * Used when MediaCapabilities API is unavailable.
 */
function canPlayTypeFallback(contentType: string): boolean {
  const result = probeCanPlayType(contentType)
  return result === 'probably' || result === 'maybe'
}

function cacheCapability(
  cacheKey: string,
  capability: Omit<CodecCapability, 'timestamp'>,
): boolean {
  capabilityCache.set(cacheKey, { ...capability, timestamp: Date.now() })
  return capability.supported
}

/**
 * Checks if a codec is supported using the MediaCapabilities API.
 * Falls back to canPlayType if MediaCapabilities is unavailable.
 *
 * Results are cached to avoid repeated browser API calls.
 *
 * @param codec - The codec name (e.g., "h264", "aac")
 * @param type - Whether this is a video or audio codec
 * @param hints - Real stream metadata used to build the codec string and config
 * @returns Promise resolving to whether the codec is supported
 */
export async function isCodecSupported(
  codec: string,
  type: 'video' | 'audio',
  hints?: CodecCapabilityHints,
): Promise<boolean> {
  const normalizedCodec = codec.toLowerCase()
  const contentType =
    type === 'video'
      ? buildVideoContentType(normalizedCodec, hints?.video)
      : buildAudioContentType(normalizedCodec)

  const cacheKey =
    contentType === null
      ? `${type}:${normalizedCodec}`
      : getCapabilityCacheKey(type, contentType, hints)

  // Check cache first
  const cached = capabilityCache.get(cacheKey)
  if (cached !== undefined) {
    return cached.supported
  }

  // Safari handles HLS natively, so we can be more permissive
  if (isSafari() && type === 'video') {
    return cacheCapability(cacheKey, {
      supported: true,
      smooth: true,
      powerEfficient: true,
    })
  }

  if (contentType === null) {
    return cacheCapability(cacheKey, {
      supported: false,
      smooth: false,
      powerEfficient: false,
    })
  }

  // Try MediaCapabilities API first
  if (typeof navigator !== 'undefined' && 'mediaCapabilities' in navigator) {
    try {
      const config =
        type === 'video'
          ? {
              type: 'file' as const,
              video: buildVideoDecodingConfig(contentType, hints?.video),
            }
          : {
              type: 'file' as const,
              audio: buildAudioDecodingConfig(contentType, hints?.channels),
            }

      const result = await navigator.mediaCapabilities.decodingInfo(config)
      return cacheCapability(cacheKey, {
        supported: result.supported,
        smooth: result.smooth,
        powerEfficient: result.powerEfficient,
      })
    } catch {
      // Fall through to canPlayType fallback
    }
  }

  // Fallback to canPlayType
  return cacheCapability(cacheKey, {
    supported: canPlayTypeFallback(contentType),
    smooth: false,
    powerEfficient: false,
  })
}

// ============================================================================
// Compatibility Checking
// ============================================================================

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
 * Checks whether a single audio track can be decoded during direct play.
 *
 * This is the synchronous, list-based variant used by the audio track
 * switching paths: they run inside a user interaction and must not block on
 * the async MediaCapabilities probe. Whether the file as a whole can direct
 * play stays the responsibility of {@link checkCompatibility}, which only ever
 * looks at the first audio stream.
 *
 * @param codec - The audio codec of the track (e.g. "aac", "dts")
 * @returns true when the browser can decode the track without transcoding
 */
export function isAudioTrackDirectPlayable(codec: string): boolean {
  return isAudioCodecInList(codec)
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
 * Only the first audio stream gates direct play; unsupported codecs on other
 * audio streams merely constrain track switching.
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
  if (!container || !isDirectPlayContainerSupported(container)) {
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
  const videoSupported = await isCodecSupported(videoCodec, 'video', {
    video: mediaSource.video,
  })
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
  const audioSupported = await isCodecSupported(audioCodec, 'audio', {
    channels: mediaSource.audioStreams?.[0]?.channels,
  })
  if (!audioSupported) {
    return {
      canDirectPlay: false,
      reason: `Browser does not support audio codec: ${audioCodec}`,
    }
  }

  return { canDirectPlay: true }
}
