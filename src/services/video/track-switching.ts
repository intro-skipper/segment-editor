/**
 * Track switching service for audio and subtitle track management.
 * Supports both HLS.js and direct play (native HTML5) modes.
 *
 * @module services/video/track-switching
 */

import type Hls from 'hls.js'
import type { AudioTrackInfo, SubtitleTrackInfo } from '@/services/video/tracks'
import type { PlaybackStrategy } from '@/services/video/api'
import { getVideoStreamUrl } from '@/services/video/api'
import { createPlaySessionId } from '@/services/video/session'
import { buildApiUrl, getCredentials, getDeviceId } from '@/services/jellyfin'
import { requiresJassubRenderer } from '@/services/video/subtitle'

/**
 * HTML5 AudioTrack interface (not in standard TypeScript DOM types).
 * @see https://developer.mozilla.org/en-US/docs/Web/API/AudioTrack
 */
interface AudioTrack {
  enabled: boolean
  id: string
  kind: string
  label: string
  language: string
}

/**
 * HTML5 AudioTrackList interface.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/AudioTrackList
 */
interface AudioTrackList {
  readonly length: number
  [index: number]: AudioTrack
  getTrackById: (id: string) => AudioTrack | null
}

/**
 * Extended HTMLVideoElement with audioTracks property.
 */
interface HTMLVideoElementWithAudioTracks extends HTMLVideoElement {
  audioTracks?: AudioTrackList
}

const SUBTITLE_TRACK_MARKER_ATTR = 'data-segment-editor-track'

function removeManagedSubtitleTracks(videoElement: HTMLVideoElement): void {
  const managedTracks = videoElement.querySelectorAll(
    `track[${SUBTITLE_TRACK_MARKER_ATTR}="true"]`,
  )
  managedTracks.forEach((track) => {
    track.remove()
  })
}

/**
 * Error types for track switching operations.
 */
type TrackSwitchErrorType =
  | 'track_unavailable'
  | 'api_unsupported'
  | 'network_error'
  | 'unknown_error'

/**
 * Error information for track switching failures.
 */
interface TrackSwitchError {
  type: TrackSwitchErrorType
  message: string
  trackIndex: number
}

/**
 * Options for track switching operations.
 */
interface TrackSwitchOptions {
  /** Current playback strategy (direct or hls) */
  strategy: PlaybackStrategy
  /** The video element for direct play operations */
  videoElement: HTMLVideoElement
  /** HLS.js instance for HLS mode operations */
  hlsInstance?: Hls | null
  /** Audio tracks for index mapping (required for HLS mode) */
  audioTracks?: Array<AudioTrackInfo>
  /** Subtitle tracks for index mapping (required for HLS mode) */
  subtitleTracks?: Array<SubtitleTrackInfo>
  /** Item ID for URL generation (needed for reload fallback) */
  itemId?: string
  /** Media source ID for URL generation */
  mediaSourceId?: string
  /** Callback to reload HLS stream with new URL (for audio track switching in HLS mode) */
  onReloadHls?: (reload: HlsReloadRequest) => Promise<void>
  /** AbortSignal to cancel async operations (e.g. subtitle load timeout) on unmount */
  signal?: AbortSignal
}

export interface HlsReloadRequest {
  url: string
  playSessionId: string
}

/**
 * JASSUB action type for ASS/SSA subtitle handling.
 */
type JassubAction = 'initialize' | 'dispose'

/**
 * Result of a track switching operation.
 */
export interface TrackSwitchResult {
  /** Whether the switch was successful */
  success: boolean
  /** Error information if the switch failed */
  error?: TrackSwitchError
  /** Whether a reload was required (direct play fallback) */
  reloadRequired?: boolean
  /** JASSUB action for ASS/SSA tracks (initialize or dispose) */
  jassubAction?: JassubAction
  /** The subtitle track info when jassubAction is 'initialize' */
  track?: SubtitleTrackInfo
}

/**
 * Generates a subtitle delivery URL for fetching external subtitles.
 *
 * @param itemId - The media item ID
 * @param trackIndex - The subtitle track index
 * @param format - The desired subtitle format (default: 'vtt')
 * @returns The subtitle delivery URL
 */
export function getSubtitleDeliveryUrl(
  itemId: string,
  trackIndex: number,
  format: string = 'vtt',
): string {
  const creds = getCredentials()
  if (!creds.serverAddress || !creds.accessToken) return ''

  const query = new URLSearchParams({
    DeviceId: getDeviceId(),
  })

  return buildApiUrl({
    serverAddress: creds.serverAddress,
    accessToken: creds.accessToken,
    endpoint: `Videos/${itemId}/${itemId}/Subtitles/${trackIndex}/0/Stream.${format}`,
    query,
  })
}

/**
 * Generates an HLS URL with a specific audio stream index.
 * Used when switching audio tracks in HLS mode requires a stream reload.
 *
 * Note: This function does NOT include StartTimeTicks because the HLS player hook
 * handles playback state preservation and restoration automatically.
 *
 * @param itemId - The media item ID
 * @param audioStreamIndex - The audio stream index to use
 * @returns The HLS URL with audio stream parameter
 */
function getHlsUrlWithAudioTrack(
  itemId: string,
  audioStreamIndex: number,
  mediaSourceId?: string,
): HlsReloadRequest {
  const playSessionId = createPlaySessionId()
  return {
    url: getVideoStreamUrl(
      { itemId, mediaSourceId, playSessionId },
      audioStreamIndex,
    ),
    playSessionId,
  }
}

/**
 * Maps a Jellyfin MediaStream index to the HLS.js/HTML5 relative index.
 * This is necessary because Jellyfin MediaStream indices include all stream types
 * (video, audio, subtitle), while HLS.js and HTML5 APIs use 0-based indices
 * within each track type.
 *
 * @param mediaStreamIndex - The Jellyfin MediaStream index to map
 * @param tracks - Array of tracks with index and relativeIndex properties
 * @returns The relative index for HLS.js/HTML5 API, or -1 if track not found
 *
 * @example
 * ```ts
 * // For tracks: [{ index: 1, relativeIndex: 0 }, { index: 2, relativeIndex: 1 }]
 * mapToRelativeIndex(2, tracks) // Returns 1
 * mapToRelativeIndex(5, tracks) // Returns -1 (not found)
 * ```
 */
function mapToRelativeIndex(
  mediaStreamIndex: number,
  tracks: Array<{ index: number; relativeIndex: number }>,
): number {
  const track = tracks.find((t) => t.index === mediaStreamIndex)
  return track?.relativeIndex ?? -1
}

function createTrackSwitchError(
  type: TrackSwitchErrorType,
  message: string,
  trackIndex: number,
): TrackSwitchResult {
  return {
    success: false,
    error: {
      type,
      message,
      trackIndex,
    },
  }
}

function findTrackByMediaStreamIndex<T extends { index: number }>(
  tracks: Array<T> | undefined,
  trackIndex: number,
): T | undefined {
  return tracks?.find((track) => track.index === trackIndex)
}

function findHlsAudioTrackIndex(
  targetTrack: AudioTrackInfo | undefined,
  trackPosition: number,
  hlsAudioTracks: Array<{ lang?: string; name?: string }>,
): number {
  if (targetTrack?.language) {
    const targetLang = targetTrack.language.toLowerCase()
    const hlsTrackIndex = hlsAudioTracks.findIndex(
      (hlsTrack) =>
        hlsTrack.lang?.toLowerCase() === targetLang ||
        (hlsTrack.name && hlsTrack.name.toLowerCase().includes(targetLang)),
    )
    if (hlsTrackIndex !== -1) return hlsTrackIndex
  }

  return trackPosition !== -1 && trackPosition < hlsAudioTracks.length
    ? trackPosition
    : -1
}

function isNativeAudioTrackIndex(
  index: number,
  nativeAudioTracks: AudioTrackList,
): boolean {
  return index >= 0 && index < nativeAudioTracks.length
}

function nativeAudioTrackLanguageMatches(
  targetLanguage: string,
  nativeLanguage: string,
): boolean {
  const targetLang = targetLanguage.toLowerCase()
  const nativeLang = nativeLanguage.toLowerCase()

  // A track whose language is unknown (the HTML AudioTrack API reports an empty
  // string) must not match every requested language. Bail out before the prefix
  // comparisons below, where slicing "" produces a wildcard prefix that
  // startsWith() always matches. An empty target language is already rejected by
  // the prefix-length guard further down, so only the native side needs this.
  if (!nativeLang) {
    return false
  }

  if (nativeLang === targetLang) {
    return true
  }

  // Compare ISO language prefixes, but only when both prefixes are at least two
  // characters so a one-character code cannot collapse into a wildcard prefix.
  const targetPrefix = targetLang.slice(0, 2)
  const nativePrefix = nativeLang.slice(0, 2)
  if (targetPrefix.length < 2 || nativePrefix.length < 2) {
    return false
  }

  return (
    nativeLang.startsWith(targetPrefix) || targetLang.startsWith(nativePrefix)
  )
}

function findNativeAudioTrackIndex(
  trackIndex: number,
  targetTrack: AudioTrackInfo,
  nativeAudioTracks: AudioTrackList,
  audioTracks: Array<AudioTrackInfo> | undefined,
): number {
  if (isNativeAudioTrackIndex(targetTrack.relativeIndex, nativeAudioTracks)) {
    return targetTrack.relativeIndex
  }

  if (targetTrack.language) {
    for (let i = 0; i < nativeAudioTracks.length; i++) {
      if (
        nativeAudioTrackLanguageMatches(
          targetTrack.language,
          nativeAudioTracks[i].language,
        )
      ) {
        return i
      }
    }
  }

  const trackPosition =
    audioTracks?.findIndex((track) => track.index === trackIndex) ?? -1
  return isNativeAudioTrackIndex(trackPosition, nativeAudioTracks)
    ? trackPosition
    : -1
}

function enableOnlyNativeAudioTrack(
  nativeAudioTracks: AudioTrackList,
  enabledIndex: number,
): void {
  for (let i = 0; i < nativeAudioTracks.length; i++) {
    nativeAudioTracks[i].enabled = i === enabledIndex
  }
}

function hideTextTracks(textTracks: ArrayLike<TextTrack>): void {
  Array.from(textTracks).forEach((track) => {
    track.mode = 'hidden'
  })
}

interface HlsReloadMessages {
  missingItemId: string
  missingReloadCallback: string
  urlGenerationFailed: string
  reloadFailed: string
}

async function reloadHlsAudioTrack(
  trackIndex: number,
  options: TrackSwitchOptions,
  messages: HlsReloadMessages,
): Promise<TrackSwitchResult> {
  const { itemId, mediaSourceId, onReloadHls } = options

  if (!itemId) {
    return createTrackSwitchError(
      'api_unsupported',
      messages.missingItemId,
      trackIndex,
    )
  }

  if (!onReloadHls) {
    return createTrackSwitchError(
      'api_unsupported',
      messages.missingReloadCallback,
      trackIndex,
    )
  }

  const reload = getHlsUrlWithAudioTrack(itemId, trackIndex, mediaSourceId)
  if (!reload.url) {
    return createTrackSwitchError(
      'network_error',
      messages.urlGenerationFailed,
      trackIndex,
    )
  }

  try {
    await onReloadHls(reload)
  } catch (err) {
    return createTrackSwitchError(
      'unknown_error',
      err instanceof Error ? err.message : messages.reloadFailed,
      trackIndex,
    )
  }

  return { success: true, reloadRequired: true }
}

/**
 * Switches audio track in HLS mode.
 *
 * IMPORTANT: Jellyfin's HLS transcoding does NOT support runtime audio track switching
 * via HLS.js API. The audio track is selected at transcode time via the AudioStreamIndex
 * URL parameter. Switching audio tracks requires restarting the transcode session with
 * a new URL containing the desired AudioStreamIndex.
 *
 * This function first checks if HLS.js has multiple audio tracks in the manifest (rare
 * for Jellyfin transcodes) and tries to switch using HLS.js API. If not available,
 * it returns `reloadRequired: true` to signal that the caller should reload the stream
 * with a new URL.
 *
 * @param trackIndex - The Jellyfin MediaStream index of the audio track to switch to
 * @param hlsInstance - The HLS.js instance
 * @param audioTracks - Array of audio tracks for validation
 * @returns Result indicating success, or that a reload is required
 */
function switchHlsAudioTrack(
  trackIndex: number,
  hlsInstance: Hls | null | undefined,
  audioTracks?: Array<AudioTrackInfo>,
): TrackSwitchResult {
  if (!hlsInstance) {
    return createTrackSwitchError(
      'api_unsupported',
      'HLS instance not available',
      trackIndex,
    )
  }

  const targetTrack = findTrackByMediaStreamIndex(audioTracks, trackIndex)
  const trackPosition =
    audioTracks?.findIndex((track) => track.index === trackIndex) ?? -1

  if (audioTracks && audioTracks.length > 0 && !targetTrack) {
    return createTrackSwitchError(
      'track_unavailable',
      `Audio track with MediaStream index ${trackIndex} not found in track list`,
      trackIndex,
    )
  }

  const hlsAudioTracks = hlsInstance.audioTracks

  if (hlsAudioTracks.length > 1) {
    const relativeIndex = findHlsAudioTrackIndex(
      targetTrack,
      trackPosition,
      hlsAudioTracks,
    )

    if (relativeIndex >= 0 && relativeIndex < hlsAudioTracks.length) {
      try {
        hlsInstance.audioTrack = relativeIndex
        return { success: true }
      } catch {
        // HLS.js switching failed, fall through to reload
      }
    }
  }

  // HLS.js doesn't have multiple audio tracks - this is the common case for Jellyfin transcodes
  // Signal that a reload is required to switch audio tracks
  return {
    success: true,
    reloadRequired: true,
  }
}

/**
 * Switches audio track in direct play mode.
 *
 * Strategy:
 * 1. Try native AudioTrack API (only works in Safari and some Chromium with flags)
 * 2. If native API unavailable, fall back to HLS with the selected audio track
 *
 * @param trackIndex - The Jellyfin MediaStream index of the audio track to switch to
 * @param options - Track switch options
 * @returns Promise resolving to the result of the switch operation
 */
async function switchDirectPlayAudioTrack(
  trackIndex: number,
  options: TrackSwitchOptions,
): Promise<TrackSwitchResult> {
  const { videoElement, audioTracks } = options

  const targetTrack = findTrackByMediaStreamIndex(audioTracks, trackIndex)
  if (!targetTrack) {
    return createTrackSwitchError(
      'track_unavailable',
      `Audio track with index ${trackIndex} not found`,
      trackIndex,
    )
  }

  const nativeAudioTracks = (videoElement as HTMLVideoElementWithAudioTracks)
    .audioTracks

  // Strategy 1: Try native AudioTrack API (Safari, some Chromium)
  if (nativeAudioTracks && nativeAudioTracks.length > 1) {
    const nativeTrackIndex = findNativeAudioTrackIndex(
      trackIndex,
      targetTrack,
      nativeAudioTracks,
      audioTracks,
    )

    if (nativeTrackIndex !== -1) {
      enableOnlyNativeAudioTrack(nativeAudioTracks, nativeTrackIndex)
      return { success: true }
    }
  }

  // Strategy 2: Fall back to HLS transcoding with selected audio track
  // This is the only way to switch audio in Chrome/Firefox for direct play content
  return reloadHlsAudioTrack(trackIndex, options, {
    missingItemId:
      'Audio track switching requires transcoding in this browser. Item ID not available.',
    missingReloadCallback:
      'Audio track switching requires transcoding in this browser. Please wait for the stream to reload.',
    urlGenerationFailed: 'Failed to generate HLS URL for audio track switching',
    reloadFailed: 'Failed to reload HLS stream for audio track switching',
  })
}

/**
 * Switches subtitle track in HLS mode using HLS.js API.
 * Maps the Jellyfin MediaStream index to the HLS.js relative index before switching.
 *
 * @param trackIndex - The Jellyfin MediaStream index of the subtitle track to switch to, or null for off
 * @param hlsInstance - The HLS.js instance
 * @param subtitleTracks - Array of subtitle tracks for index mapping
 * @returns Result of the switch operation
 */
function switchHlsSubtitleTrack(
  trackIndex: number | null,
  hlsInstance: Hls | null | undefined,
  subtitleTracks?: Array<SubtitleTrackInfo>,
): TrackSwitchResult {
  if (!hlsInstance) {
    return {
      success: false,
      error: {
        type: 'api_unsupported',
        message: 'HLS instance not available',
        trackIndex: trackIndex ?? -1,
      },
    }
  }

  try {
    // Handle "off" selection
    if (trackIndex === null) {
      hlsInstance.subtitleTrack = -1
      return { success: true }
    }

    // Map MediaStream index to HLS.js relative index
    let relativeIndex: number

    if (subtitleTracks && subtitleTracks.length > 0) {
      relativeIndex = mapToRelativeIndex(trackIndex, subtitleTracks)
      if (relativeIndex === -1) {
        return {
          success: false,
          error: {
            type: 'track_unavailable',
            message: `Subtitle track with MediaStream index ${trackIndex} not found in track list`,
            trackIndex,
          },
        }
      }
    } else {
      // Fallback: assume trackIndex is already a relative index (legacy behavior)
      relativeIndex = trackIndex
    }

    // Check if relative index is valid against HLS.js subtitleTracks
    const hlsSubtitleTracks = hlsInstance.subtitleTracks
    if (relativeIndex < 0 || relativeIndex >= hlsSubtitleTracks.length) {
      return {
        success: false,
        error: {
          type: 'track_unavailable',
          message: `Subtitle track relative index ${relativeIndex} is out of range (0-${hlsSubtitleTracks.length - 1})`,
          trackIndex,
        },
      }
    }

    // Switch the subtitle track using the relative index
    hlsInstance.subtitleTrack = relativeIndex

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: {
        type: 'unknown_error',
        message:
          err instanceof Error
            ? err.message
            : 'Failed to switch subtitle track',
        trackIndex: trackIndex ?? -1,
      },
    }
  }
}

/**
 * Switches subtitle track in direct play mode using the TextTrack API.
 * Uses relativeIndex for TextTrack array access.
 *
 * @param trackIndex - The Jellyfin MediaStream index of the subtitle track to switch to, or null for off
 * @param options - Track switch options
 * @returns Promise resolving to the result of the switch operation
 */
async function switchDirectPlaySubtitleTrack(
  trackIndex: number | null,
  options: TrackSwitchOptions,
): Promise<TrackSwitchResult> {
  const { videoElement, itemId, subtitleTracks, signal } = options
  const textTracks = videoElement.textTracks

  // Handle "Off" selection - hide all tracks
  if (trackIndex === null) {
    hideTextTracks(textTracks)
    removeManagedSubtitleTracks(videoElement)
    return { success: true }
  }

  // Map MediaStream index to relative index for TextTrack array access
  let relativeIndex: number
  if (subtitleTracks && subtitleTracks.length > 0) {
    relativeIndex = mapToRelativeIndex(trackIndex, subtitleTracks)
  } else {
    // Fallback: assume trackIndex is already a relative index (legacy behavior)
    relativeIndex = trackIndex
  }

  // Check if track exists in TextTracks using relativeIndex
  if (relativeIndex >= 0 && relativeIndex < textTracks.length) {
    hideTextTracks(textTracks)
    // Show the selected track using relativeIndex
    textTracks[relativeIndex].mode = 'showing'
    return { success: true }
  }

  // Track not in TextTracks - may need to fetch external subtitle
  if (!itemId) {
    return {
      success: false,
      error: {
        type: 'track_unavailable',
        message:
          'Subtitle track not available and no item ID for external fetch',
        trackIndex,
      },
    }
  }

  // Fetch external subtitle (use original MediaStream index for Jellyfin API)
  try {
    const subtitleUrl = getSubtitleDeliveryUrl(itemId, trackIndex, 'vtt')
    if (!subtitleUrl) {
      return {
        success: false,
        error: {
          type: 'network_error',
          message: 'Failed to generate subtitle URL',
          trackIndex,
        },
      }
    }

    // Create a new track element
    removeManagedSubtitleTracks(videoElement)

    const trackElement = document.createElement('track')
    trackElement.kind = 'subtitles'
    trackElement.src = subtitleUrl
    trackElement.default = true
    trackElement.setAttribute(SUBTITLE_TRACK_MARKER_ATTR, 'true')

    hideTextTracks(textTracks)

    // Add and show the new track
    videoElement.appendChild(trackElement)

    // Wait for track to load
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(
        () => reject(new Error('Subtitle load timeout')),
        10000,
      )

      const handleAbort = () => {
        cleanup()
        reject(new Error('Subtitle load aborted'))
      }

      const cleanup = () => {
        clearTimeout(timeoutId)
        trackElement.removeEventListener('load', handleLoad)
        trackElement.removeEventListener('error', handleError)
        signal?.removeEventListener('abort', handleAbort)
      }

      const handleLoad = () => {
        cleanup()
        resolve()
      }

      const handleError = () => {
        cleanup()
        reject(new Error('Failed to load subtitle'))
      }

      trackElement.addEventListener('load', handleLoad)
      trackElement.addEventListener('error', handleError)
      // Cancel the timeout when the caller's AbortSignal fires (e.g. component unmount)
      signal?.addEventListener('abort', handleAbort, { once: true })
    })

    // Find and show the newly added track
    textTracks[textTracks.length - 1].mode = 'showing'

    return { success: true }
  } catch (err) {
    removeManagedSubtitleTracks(videoElement)
    return {
      success: false,
      error: {
        type: 'network_error',
        message:
          err instanceof Error
            ? err.message
            : 'Failed to load external subtitle',
        trackIndex,
      },
    }
  }
}

/**
 * Switches audio track using the appropriate method based on playback strategy.
 *
 * For HLS mode: If HLS.js doesn't support runtime switching (most Jellyfin transcodes),
 * this will trigger a stream reload with the new AudioStreamIndex parameter.
 *
 * For Direct Play: Tries native AudioTrack API first, falls back to URL reload.
 *
 * @param trackIndex - The Jellyfin MediaStream index of the audio track to switch to
 * @param options - Track switch options (includes audioTracks for index mapping)
 * @returns Promise resolving to the result of the switch operation
 */
export async function switchAudioTrack(
  trackIndex: number,
  options: TrackSwitchOptions,
): Promise<TrackSwitchResult> {
  if (options.strategy === 'hls') {
    const result = switchHlsAudioTrack(
      trackIndex,
      options.hlsInstance,
      options.audioTracks,
    )

    // If HLS switching requires a reload, generate new URL and trigger reload
    if (result.success && result.reloadRequired) {
      return reloadHlsAudioTrack(trackIndex, options, {
        missingItemId: 'Item ID required for HLS audio track switching',
        missingReloadCallback: 'HLS reload callback not provided',
        urlGenerationFailed: 'Failed to generate HLS URL with audio track',
        reloadFailed: 'Failed to reload HLS stream with new audio track',
      })
    }

    return result
  }
  return switchDirectPlayAudioTrack(trackIndex, options)
}

/**
 * Switches subtitle track using the appropriate method based on playback strategy.
 * For ASS/SSA tracks, returns jassubAction to signal JASSUB renderer should handle it.
 *
 * @param trackIndex - The Jellyfin MediaStream index of the subtitle track to switch to, or null for off
 * @param options - Track switch options (includes subtitleTracks for index mapping)
 * @returns Promise resolving to the result of the switch operation
 */
export async function switchSubtitleTrack(
  trackIndex: number | null,
  options: TrackSwitchOptions,
): Promise<TrackSwitchResult> {
  // Handle "off" selection - signal JASSUB to dispose if active
  if (trackIndex === null) {
    hideTextTracks(options.videoElement.textTracks)

    // Also disable HLS subtitles if in HLS mode
    if (options.strategy === 'hls' && options.hlsInstance) {
      options.hlsInstance.subtitleTrack = -1
    }

    return { success: true, jassubAction: 'dispose' }
  }

  // Find the track to determine if it's ASS/SSA
  const track = options.subtitleTracks?.find((t) => t.index === trackIndex)
  if (!track) {
    return {
      success: false,
      error: {
        type: 'track_unavailable',
        message: `Subtitle track with index ${trackIndex} not found`,
        trackIndex,
      },
    }
  }

  // Check if ASS/SSA - delegate to JASSUB renderer
  if (requiresJassubRenderer(track)) {
    hideTextTracks(options.videoElement.textTracks)

    // Also disable HLS subtitles if in HLS mode
    if (options.strategy === 'hls' && options.hlsInstance) {
      options.hlsInstance.subtitleTrack = -1
    }

    return { success: true, jassubAction: 'initialize', track }
  }

  // Non-ASS: use existing TextTrack/HLS subtitle handling
  if (options.strategy === 'hls') {
    return switchHlsSubtitleTrack(
      trackIndex,
      options.hlsInstance,
      options.subtitleTracks,
    )
  }
  return switchDirectPlaySubtitleTrack(trackIndex, options)
}
