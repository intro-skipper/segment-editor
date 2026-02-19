/**
 * Track types and constants for audio and subtitle track management.
 * Provides interfaces for track metadata and display formatting.
 *
 * @module services/video/tracks
 */

import { getLanguageName } from '@/lib/language-utils'

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Audio track metadata extracted from Jellyfin MediaStream.
 * Contains all information needed to display and select audio tracks.
 *
 * Index mapping:
 * - `index`: Original Jellyfin MediaStream index (includes all stream types: video, audio, subtitle)
 * - `relativeIndex`: 0-based position within audio tracks only (for HLS.js/HTML5 API)
 */
export interface AudioTrackInfo {
  /**
   * Original Jellyfin MediaStream index.
   * This is the index within the MediaSource that includes all stream types (video, audio, subtitle).
   * Use this for Jellyfin API calls like audioStreamIndex parameter.
   */
  index: number
  /**
   * 0-based position within audio tracks only.
   * Use this for HLS.js audioTrack setter and HTML5 audioTracks array access.
   */
  relativeIndex: number
  /** ISO 639 language code (e.g., "eng", "deu") or null if unknown */
  language: string | null
  /** Human-readable display title for the track */
  displayTitle: string
  /** Audio codec (e.g., "aac", "ac3", "dts") */
  codec: string
  /** Number of audio channels (1=mono, 2=stereo, 6=5.1, 8=7.1) */
  channels: number
  /** Whether this is the default audio track */
  isDefault: boolean
}

/**
 * Subtitle track metadata extracted from Jellyfin MediaStream.
 * Contains all information needed to display and select subtitle tracks.
 *
 * Index mapping:
 * - `index`: Original Jellyfin MediaStream index (includes all stream types: video, audio, subtitle)
 * - `relativeIndex`: 0-based position within subtitle tracks only (for HLS.js/HTML5 API)
 */
export interface SubtitleTrackInfo {
  /**
   * Original Jellyfin MediaStream index.
   * This is the index within the MediaSource that includes all stream types (video, audio, subtitle).
   * Use this for Jellyfin API calls.
   */
  index: number
  /**
   * 0-based position within subtitle tracks only.
   * Use this for HLS.js subtitleTrack setter and HTML5 textTracks array access.
   */
  relativeIndex: number
  /** ISO 639 language code (e.g., "eng", "deu") or null if unknown */
  language: string | null
  /** Human-readable display title for the track */
  displayTitle: string
  /** Subtitle format (e.g., "SRT", "ASS", "PGS") */
  format: string
  /** Whether the subtitle is an external file (not embedded) */
  isExternal: boolean
  /** Whether this is the default subtitle track */
  isDefault: boolean
  /** URL to fetch external subtitles from Jellyfin server */
  deliveryUrl?: string
}

/**
 * Current state of audio and subtitle tracks for a media item.
 * Used by the track manager hook to track available and active tracks.
 */
export interface TrackState {
  /** All available audio tracks */
  audioTracks: Array<AudioTrackInfo>
  /** All available subtitle tracks */
  subtitleTracks: Array<SubtitleTrackInfo>
  /** Index of the currently active audio track */
  activeAudioIndex: number
  /** Index of the currently active subtitle track, or null if subtitles are off */
  activeSubtitleIndex: number | null
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Mapping of subtitle codec names to human-readable format names.
 * Used for displaying subtitle format in the track selector UI.
 */
const SUBTITLE_FORMATS: Record<string, string> = {
  srt: 'SRT',
  subrip: 'SRT',
  ass: 'ASS',
  ssa: 'SSA',
  pgs: 'PGS',
  pgssub: 'PGS',
  hdmv_pgs_subtitle: 'PGS',
  vobsub: 'VobSub',
  dvdsub: 'DVD',
  dvd_subtitle: 'DVD',
  webvtt: 'WebVTT',
  vtt: 'WebVTT',
  mov_text: 'MOV',
  text: 'Text',
} as const

/**
 * Mapping of channel counts to human-readable labels.
 * Used for displaying audio channel configuration in the track selector UI.
 */
const CHANNEL_LABELS: Record<number, string> = {
  1: 'Mono',
  2: 'Stereo',
  6: '5.1',
  8: '7.1',
} as const

/**
 * MediaStream type identifiers from Jellyfin API.
 */
const AUDIO_STREAM_TYPE = 'Audio' as const
const SUBTITLE_STREAM_TYPE = 'Subtitle' as const

// ============================================================================
// Track Extraction Types
// ============================================================================

/**
 * Result of extracting tracks from a media item.
 */
interface TrackExtractionResult {
  /** All audio tracks found in the media source */
  audioTracks: Array<AudioTrackInfo>
  /** All subtitle tracks found in the media source */
  subtitleTracks: Array<SubtitleTrackInfo>
}

/**
 * Jellyfin MediaStream type definition for track extraction.
 * Subset of fields used for audio and subtitle track parsing.
 */
interface MediaStream {
  Type?: string
  Index?: number
  Language?: string
  DisplayTitle?: string
  Codec?: string
  Channels?: number
  IsDefault?: boolean
  IsExternal?: boolean
  DeliveryUrl?: string
}

/**
 * Jellyfin MediaSourceInfo type definition.
 */
interface MediaSourceInfo {
  MediaStreams?: Array<MediaStream>
}

/**
 * Minimal BaseItemDto interface for track extraction.
 */
interface ItemWithMediaSources {
  MediaSources?: Array<MediaSourceInfo>
}

// ============================================================================
// Track Extraction Functions
// ============================================================================

/**
 * Extracts audio and subtitle track information from a Jellyfin media item.
 * Parses MediaStreams from the first MediaSource and returns structured track info.
 *
 * The function assigns both `index` (original Jellyfin MediaStream index) and
 * `relativeIndex` (0-based position within tracks of the same type) to each track.
 *
 * @param item - The Jellyfin BaseItemDto containing MediaSources
 * @returns Object containing arrays of audio and subtitle tracks
 *
 * @example
 * ```ts
 * const { audioTracks, subtitleTracks } = extractTracks(item)
 * // For a media file with streams [Video(0), Audio(1), Audio(2), Subtitle(3)]:
 * // audioTracks[0].index = 1, audioTracks[0].relativeIndex = 0
 * // audioTracks[1].index = 2, audioTracks[1].relativeIndex = 1
 * // subtitleTracks[0].index = 3, subtitleTracks[0].relativeIndex = 0
 * ```
 */
export function extractTracks(
  item: ItemWithMediaSources | null | undefined,
): TrackExtractionResult {
  const emptyResult: TrackExtractionResult = {
    audioTracks: [],
    subtitleTracks: [],
  }

  if (!item?.MediaSources?.length) {
    return emptyResult
  }

  // Use the first media source (primary source)
  const mediaSource = item.MediaSources[0]
  const streams = mediaSource.MediaStreams ?? []

  const audioTracks: Array<AudioTrackInfo> = []
  const subtitleTracks: Array<SubtitleTrackInfo> = []

  // Track relative indices separately for audio and subtitle tracks
  let audioRelativeIndex = 0
  let subtitleRelativeIndex = 0

  for (const stream of streams) {
    if (stream.Type === AUDIO_STREAM_TYPE) {
      audioTracks.push(extractAudioTrack(stream, audioRelativeIndex))
      audioRelativeIndex++
    } else if (stream.Type === SUBTITLE_STREAM_TYPE) {
      subtitleTracks.push(extractSubtitleTrack(stream, subtitleRelativeIndex))
      subtitleRelativeIndex++
    }
  }

  return { audioTracks, subtitleTracks }
}

/**
 * Extracts audio track info from a MediaStream.
 *
 * @param stream - The MediaStream to extract from
 * @param relativeIndex - The 0-based position within audio tracks
 */
function extractAudioTrack(
  stream: MediaStream,
  relativeIndex: number,
): AudioTrackInfo {
  const language = stream.Language ?? null
  const codec = stream.Codec?.toUpperCase() ?? 'Unknown'
  const channels = stream.Channels ?? 2

  return {
    index: stream.Index ?? 0,
    relativeIndex,
    language,
    displayTitle:
      stream.DisplayTitle ??
      formatAudioTrackLabel({ language, codec, channels }),
    codec,
    channels,
    isDefault: stream.IsDefault ?? false,
  }
}

/**
 * Extracts subtitle track info from a MediaStream.
 *
 * @param stream - The MediaStream to extract from
 * @param relativeIndex - The 0-based position within subtitle tracks
 */
function extractSubtitleTrack(
  stream: MediaStream,
  relativeIndex: number,
): SubtitleTrackInfo {
  const language = stream.Language ?? null
  const codec = stream.Codec?.toLowerCase() ?? ''
  const format = SUBTITLE_FORMATS[codec] ?? (codec.toUpperCase() || 'Unknown')

  return {
    index: stream.Index ?? 0,
    relativeIndex,
    language,
    displayTitle:
      stream.DisplayTitle ?? formatSubtitleTrackLabel({ language, format }),
    format,
    isExternal: stream.IsExternal ?? false,
    isDefault: stream.IsDefault ?? false,
    deliveryUrl: stream.DeliveryUrl,
  }
}

// ============================================================================
// Track Label Formatting Functions
// ============================================================================

/**
 * Formats an audio track label for display in the track selector.
 * Includes language name (or "Unknown"), codec, and channel configuration.
 *
 * @param track - Object containing language, codec, and channels
 * @returns Formatted label string (e.g., "English - AAC 5.1")
 *
 * @example
 * ```ts
 * formatAudioTrackLabel({ language: 'eng', codec: 'AAC', channels: 6 })
 * // Returns: "English - AAC 5.1"
 *
 * formatAudioTrackLabel({ language: null, codec: 'AC3', channels: 2 })
 * // Returns: "Unknown - AC3 Stereo"
 * ```
 */
function formatAudioTrackLabel(track: {
  language: string | null
  codec: string
  channels: number
}): string {
  const languageName = getLanguageName(track.language)
  const channelLabel = CHANNEL_LABELS[track.channels] ?? `${track.channels}ch`

  return `${languageName} - ${track.codec} ${channelLabel}`
}

/**
 * Formats a subtitle track label for display in the track selector.
 * Includes language name (or "Unknown") and format (SRT, ASS, PGS, etc.).
 *
 * @param track - Object containing language and format
 * @returns Formatted label string (e.g., "English - SRT")
 *
 * @example
 * ```ts
 * formatSubtitleTrackLabel({ language: 'eng', format: 'SRT' })
 * // Returns: "English - SRT"
 *
 * formatSubtitleTrackLabel({ language: null, format: 'ASS' })
 * // Returns: "Unknown - ASS"
 * ```
 */
function formatSubtitleTrackLabel(track: {
  language: string | null
  format: string
}): string {
  const languageName = getLanguageName(track.language)

  return `${languageName} - ${track.format}`
}

// ============================================================================
// Language Utilities
// ============================================================================
// getLanguageName is imported from @/lib/language-utils — single source of truth.
