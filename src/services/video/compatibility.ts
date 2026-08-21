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
import { getContainerDefaultAudioTrack } from '@/services/video/tracks'
import { lookup } from '@/lib/utils'

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
  /** Whether the container flags this stream as the default audio track */
  isDefault?: boolean
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
  audioStreams?: ReadonlyArray<AudioStreamInfo>
}

/**
 * Result of compatibility check.
 */
interface CompatibilityResult {
  canDirectPlay: boolean
  reason?: string
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
export const DIRECT_PLAY_CONTAINERS: ReadonlyArray<string> = [
  'mp4',
  'mkv',
  'webm',
]

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
 * Cache for browser codec capability results. Holds the settled boolean, or
 * the in-flight probe promise so concurrent lookups for the same shape share
 * one browser round trip.
 * Key format: `${type}:${configSignature}`
 */
const capabilityCache: Map<string, boolean | Promise<boolean>> = new Map()

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
 * Reads go through `lookup`, which reports a miss as undefined.
 */
const H264_PROFILE_IDS = {
  baseline: '42',
  'constrained baseline': '42',
  main: '4D',
  high: '64',
} satisfies Record<string, string>

/** profile_idc used when the media source does not report a profile. */
const DEFAULT_H264_PROFILE_ID = '64'
/** level_idc (hex) used when the media source does not report a level. */
const DEFAULT_H264_LEVEL_ID = '28'

/** VP9 profile ids keyed by the profile name Jellyfin reports. */
const VP9_PROFILE_IDS = {
  'profile 0': '00',
  'profile 1': '01',
  'profile 2': '02',
  'profile 3': '03',
} satisfies Record<string, string>

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
 * Selects the two-digit bit-depth field shared by the `av01`/`vp09` codec
 * strings: 12 bits and above map to `12`, 10-11 to `10`, everything else
 * (including missing metadata) to the 8-bit default.
 */
function chooseBitDepth(bitDepth: number | undefined): '08' | '10' | '12' {
  if (!isPositiveNumber(bitDepth)) return '08'
  if (bitDepth >= 12) return '12'
  return bitDepth >= 10 ? '10' : '08'
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
    lookup(H264_PROFILE_IDS, profile?.trim().toLowerCase() ?? '') ??
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
  // HEVC decimal levels stop at 6.2, and general_level_idc starts at 30
  // (level 1.0 = 30), so >= 30 must be treated as an idc, not a decimal.
  return level >= 30 ? Math.round(level) : Math.round(level * 30)
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
 * AV1 profile ids keyed by the profile name Jellyfin reports.
 * Main = 0 (4:2:0), High = 1 (4:4:4), Professional = 2 (4:2:2 / 12-bit).
 */
const AV1_PROFILE_IDS = {
  main: '0',
  high: '1',
  professional: '2',
} satisfies Record<string, string>

/**
 * Builds an `av01.<profile>.<seq level>M.<bit depth>` codec string from AV1
 * metadata. The profile follows the reported profile name, except that 12-bit
 * is only valid in the Professional profile (2), which then takes precedence.
 *
 * @param profile - Jellyfin profile name (Main, High, Professional), defaults to Main
 * @param level - Jellyfin level (seq_level_idx or major.minor), defaults to 8
 * @param bitDepth - Bits per sample (8, 10, or 12), defaults to 8
 */
export function buildAv1CodecString(
  profile?: string,
  level?: number,
  bitDepth?: number,
): string {
  const seqLevel = String(normalizeAv1SeqLevel(level)).padStart(2, '0')
  const depth = chooseBitDepth(bitDepth)

  // 12-bit is only valid in the Professional profile (2); otherwise follow
  // the reported profile name, defaulting to Main (0).
  const profileId =
    depth === '12'
      ? '2'
      : (lookup(AV1_PROFILE_IDS, profile?.trim().toLowerCase() ?? '') ?? '0')
  return `av01.${profileId}.${seqLevel}M.${depth}`
}

/**
 * Builds a `vp09.PP.LL.DD` codec string from VP9 stream metadata.
 *
 * Profiles 0/1 only allow 8-bit, so a 10/12-bit stream reported with an
 * 8-bit profile is promoted to the matching high-bit-depth profile (0→2,
 * 1→3) to keep the codec string self-consistent.
 *
 * @param profile - Jellyfin profile name ("Profile 0"), defaults to profile 0
 * @param level - Jellyfin level (4.1 or 41), defaults to level 1.0
 * @param bitDepth - Bits per sample (8, 10, or 12), defaults to 8
 */
export function buildVp9CodecString(
  profile?: string,
  level?: number,
  bitDepth?: number,
): string {
  let profileId =
    lookup(VP9_PROFILE_IDS, profile?.trim().toLowerCase() ?? '') ??
    DEFAULT_VP9_PROFILE_ID
  const normalizedLevel = normalizeDecimalLevel(level)
  const levelId =
    normalizedLevel === undefined
      ? DEFAULT_VP9_LEVEL_ID
      : String(normalizedLevel).padStart(2, '0')
  const depth = chooseBitDepth(bitDepth)

  if (depth !== '08') {
    if (profileId === '00') profileId = '02'
    else if (profileId === '01') profileId = '03'
  }

  return `vp09.${profileId}.${levelId}.${depth}`
}

function buildHevcContentType(video?: VideoStreamInfo): string {
  return `video/mp4; codecs="${buildHevcCodecString(video?.profile, video?.level)}"`
}

/**
 * Content type builders for the supported video codecs, keyed by the codec
 * name Jellyfin reports. This table is the single definition of which video
 * codecs are direct playable: {@link DIRECT_PLAY_VIDEO_CODECS} is derived from
 * its keys, so a codec can never be listed as supported without a way to build
 * its content type (or the reverse).
 */
const VIDEO_CODEC_CONTENT_TYPE_BUILDERS = {
  h264: (video) =>
    `video/mp4; codecs="${buildH264CodecString(video?.profile, video?.level)}"`,
  hevc: buildHevcContentType,
  h265: buildHevcContentType,
  vp9: (video) =>
    `video/webm; codecs="${buildVp9CodecString(video?.profile, video?.level, video?.bitDepth)}"`,
  av1: (video) =>
    `video/mp4; codecs="${buildAv1CodecString(video?.profile, video?.level, video?.bitDepth)}"`,
} satisfies Record<string, (video?: VideoStreamInfo) => string>

/**
 * Supported video codecs for direct play.
 */
export const DIRECT_PLAY_VIDEO_CODECS: ReadonlyArray<string> = Object.keys(
  VIDEO_CODEC_CONTENT_TYPE_BUILDERS,
)

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
  const build = lookup(VIDEO_CODEC_CONTENT_TYPE_BUILDERS, codec.toLowerCase())
  return build ? build(video) : null
}

/**
 * Content types for the supported audio codecs. This table is the single
 * definition of which audio codecs are direct playable:
 * {@link DIRECT_PLAY_AUDIO_CODECS} is derived from its keys.
 */
const AUDIO_CODEC_MIME_MAP = {
  aac: 'audio/mp4; codecs="mp4a.40.2"',
  mp3: 'audio/mpeg',
  opus: 'audio/webm; codecs="opus"',
  flac: 'audio/flac',
  ac3: 'audio/mp4; codecs="ac-3"',
  eac3: 'audio/mp4; codecs="ec-3"',
} satisfies Record<string, string>

/**
 * Supported audio codecs for direct play.
 */
export const DIRECT_PLAY_AUDIO_CODECS: ReadonlyArray<string> =
  Object.keys(AUDIO_CODEC_MIME_MAP)

/**
 * Builds the MediaCapabilities/`canPlayType` content type for an audio codec.
 *
 * @returns The content type, or null when the codec is not direct playable
 */
export function buildAudioContentType(codec: string): string | null {
  return lookup(AUDIO_CODEC_MIME_MAP, codec.toLowerCase()) ?? null
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
 * Feature detects Matroska direct play support.
 *
 * MKV is feature detected instead of assumed: Chromium only recognizes
 * `video/x-matroska` from version 145 onwards (older builds return `''` and
 * must transcode).
 */
function isMkvDirectPlayable(): boolean {
  // Firefox 145+ plays MKV, but any MKV with a supported audio track is
  // buffered in full before playback starts (Bugzilla 2000420, unfixed),
  // so MKV direct play stays disabled there.
  if (isFirefox()) return false
  return probeCanPlayType(MATROSKA_MIME_TYPE) !== ''
}

/**
 * Checks if a container is supported for direct play in the current browser.
 * MKV support is feature detected per browser, see {@link isMkvDirectPlayable}.
 */
export function isDirectPlayContainerSupported(container: string): boolean {
  const normalized = container.toLowerCase()

  if (!DIRECT_PLAY_CONTAINERS.includes(normalized)) {
    return false
  }

  if (normalized === 'mkv') {
    return isMkvDirectPlayable()
  }

  return true
}

function clampNumber(value: number | undefined, fallback: number): number {
  return isPositiveNumber(value) ? value : fallback
}

/**
 * Rounds a bitrate up to the next whole Mbps.
 *
 * Decoder support is tiered rather than exact, so probing at Mbps granularity
 * gives the same answer as the raw stream bitrate while letting every file at
 * a given quality tier share one cache entry. Keeping the raw value would make
 * the cache key unique per file, so every playback would re-probe.
 */
function toMbpsBucket(bitrate: number): number {
  return Math.max(1, Math.ceil(bitrate / 1_000_000)) * 1_000_000
}

/** Whether the stream reports a high dynamic range (Jellyfin `VideoRange`). */
function isHdrVideoRange(videoRange: string | undefined): boolean {
  return videoRange?.trim().toUpperCase() === 'HDR'
}

interface VideoDecodingConfig {
  contentType: string
  width: number
  height: number
  bitrate: number
  framerate: number
  transferFunction?: 'pq'
  colorGamut?: 'rec2020'
  hdrMetadataType?: 'smpteSt2086'
}

function buildVideoDecodingConfig(
  contentType: string,
  video?: VideoStreamInfo,
): VideoDecodingConfig {
  const config: VideoDecodingConfig = {
    contentType,
    width: Math.round(clampNumber(video?.width, DEFAULT_VIDEO_WIDTH)),
    height: Math.round(clampNumber(video?.height, DEFAULT_VIDEO_HEIGHT)),
    bitrate: toMbpsBucket(clampNumber(video?.bitrate, DEFAULT_VIDEO_BITRATE)),
    framerate: Math.round(
      clampNumber(video?.frameRate, DEFAULT_VIDEO_FRAMERATE),
    ),
  }

  // Probe HDR streams as HDR so SDR-only decoders reject them. PQ/rec2020/
  // SMPTE ST 2086 is the common HDR10 shape; isCodecSupported retries without
  // these members when the browser rejects the dictionary (they are
  // Chromium-only). The config doubles as the cache key, so HDR and SDR
  // probes never share an entry.
  if (isHdrVideoRange(video?.videoRange)) {
    config.transferFunction = 'pq'
    config.colorGamut = 'rec2020'
    config.hdrMetadataType = 'smpteSt2086'
  }

  return config
}

interface AudioDecodingConfig {
  contentType: string
  channels: string
  bitrate: number
  samplerate: number
}

function buildAudioDecodingConfig(
  contentType: string,
  channels?: number,
): AudioDecodingConfig {
  return {
    contentType,
    channels: String(Math.round(clampNumber(channels, DEFAULT_AUDIO_CHANNELS))),
    bitrate: DEFAULT_AUDIO_BITRATE,
    samplerate: DEFAULT_AUDIO_SAMPLERATE,
  }
}

type DecodingConfig =
  | { type: 'file'; video: VideoDecodingConfig; audio?: undefined }
  | { type: 'file'; audio: AudioDecodingConfig; video?: undefined }

/**
 * Builds the decoding config for a capability query.
 * The config doubles as the cache key, so a field that refines the probe
 * cannot be added without also refining the key.
 */
function buildDecodingConfig(
  type: 'video' | 'audio',
  contentType: string,
  hints: CodecCapabilityHints | undefined,
): DecodingConfig {
  return type === 'video'
    ? {
        type: 'file',
        video: buildVideoDecodingConfig(contentType, hints?.video),
      }
    : {
        type: 'file',
        audio: buildAudioDecodingConfig(contentType, hints?.channels),
      }
}

/**
 * Checks codec support using the canPlayType fallback method.
 * Used when MediaCapabilities API is unavailable.
 */
function canPlayTypeFallback(contentType: string): boolean {
  const result = probeCanPlayType(contentType)
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

  const config =
    contentType === null ? null : buildDecodingConfig(type, contentType, hints)

  const cacheKey =
    config === null
      ? `${type}:${normalizedCodec}`
      : `${type}:${JSON.stringify(config.video ?? config.audio)}`

  // Check cache first
  const cached = capabilityCache.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  const probe = async (): Promise<boolean> => {
    // Safari handles HLS natively, so we can be more permissive
    if (isSafari() && type === 'video') {
      return true
    }

    if (contentType === null || config === null) {
      return false
    }

    // Try MediaCapabilities API first
    if (typeof navigator !== 'undefined' && 'mediaCapabilities' in navigator) {
      try {
        let result: MediaCapabilitiesDecodingInfo
        try {
          result = await navigator.mediaCapabilities.decodingInfo(config)
        } catch (err) {
          // The HDR dictionary members are Chromium-only; retry the plain SDR
          // shape before giving up on MediaCapabilities.
          if (config.video?.transferFunction === undefined) throw err
          const {
            transferFunction: _tf,
            colorGamut: _cg,
            hdrMetadataType: _hdr,
            ...sdrVideo
          } = config.video
          result = await navigator.mediaCapabilities.decodingInfo({
            type: 'file',
            video: sdrVideo,
          })
        }
        return result.supported
      } catch {
        // Fall through to canPlayType fallback
      }
    }

    // Fallback to canPlayType
    return canPlayTypeFallback(contentType)
  }

  // Cache the in-flight probe so concurrent callers with the same shape
  // (common when a multi-track item fans out per-track probes) share one
  // browser round trip, then overwrite the pending entry with the settled
  // boolean at this single write site.
  const pending = probe()
  capabilityCache.set(cacheKey, pending)
  void pending.then((supported) => capabilityCache.set(cacheKey, supported))
  return pending
}

// ============================================================================
// Compatibility Checking
// ============================================================================

/**
 * Checks if a video codec is in the supported list.
 */
function isVideoCodecInList(codec: string): boolean {
  return DIRECT_PLAY_VIDEO_CODECS.includes(codec.toLowerCase())
}

/**
 * Checks whether a single audio track's codec is on the direct-play
 * allowlist.
 *
 * This is the synchronous first gate of {@link isAudioTrackDecodable}, and
 * the interim answer for UI paths that cannot block on the async decoder
 * probe.
 *
 * @param codec - The audio codec of the track (e.g. "aac", "dts")
 */
export function isAudioTrackDirectPlayable(codec: string): boolean {
  return DIRECT_PLAY_AUDIO_CODECS.includes(codec.toLowerCase())
}

/**
 * Whether the browser can decode a single audio track during direct play.
 * The allowlist check filters known-untranscodable codecs (e.g. DTS)
 * synchronously; the MediaCapabilities probe then catches codecs that are on
 * the list but have no decoder in this browser build (e.g. E-AC-3 on Chromium
 * variants without proprietary codecs).
 *
 * The playback strategy decision, the native track switch, and the transcode
 * hint all resolve through here, so they cannot disagree about which tracks
 * transcode.
 */
export async function isAudioTrackDecodable(track: {
  codec: string
  channels?: number
}): Promise<boolean> {
  return (
    isAudioTrackDirectPlayable(track.codec) &&
    (await isCodecSupported(track.codec, 'audio', { channels: track.channels }))
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
 * Only the container-default audio stream (the `IsDefault`-flagged one, or
 * the first when no flag is set) gates direct play, because that is the track
 * the browser starts on; unsupported codecs on other audio streams merely
 * constrain track switching.
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

  const { container, videoCodec } = mediaSource

  // The browser starts playback on the container-default track, so that is
  // the stream that decides direct play. Legacy callers without audioStreams
  // metadata fall back to the flat audioCodec field.
  const defaultAudioStream = getContainerDefaultAudioTrack(
    mediaSource.audioStreams ?? [],
  )
  const audioCodec = defaultAudioStream?.codec || mediaSource.audioCodec

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

  // Check audio codec is in supported list
  if (!audioCodec || !isAudioTrackDirectPlayable(audioCodec)) {
    return {
      canDirectPlay: false,
      reason: `Unsupported audio codec: ${audioCodec || 'unknown'}`,
    }
  }

  // Both browser probes are independent, so they run concurrently rather than
  // paying two serial MediaCapabilities round trips on every playback start.
  const [videoSupported, audioSupported] = await Promise.all([
    isCodecSupported(videoCodec, 'video', { video: mediaSource.video }),
    isCodecSupported(audioCodec, 'audio', {
      channels: defaultAudioStream?.channels,
    }),
  ])

  if (!videoSupported) {
    return {
      canDirectPlay: false,
      reason: `Browser does not support video codec: ${videoCodec}`,
    }
  }

  if (!audioSupported) {
    return {
      canDirectPlay: false,
      reason: `Browser does not support audio codec: ${audioCodec}`,
    }
  }

  return { canDirectPlay: true }
}
