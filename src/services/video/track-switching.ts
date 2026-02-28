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
import { buildApiUrl, getCredentials, getDeviceId } from '@/services/jellyfin'
import { requiresJassubRenderer } from '@/services/video/subtitle'

// ============================================================================
// HTML5 AudioTrack API Type Declarations
// ============================================================================

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

// ============================================================================
// Types and Interfaces
// ============================================================================

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
export interface TrackSwitchError {
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
  onReloadHls?: (newUrl: string) => Promise<void>
  /** AbortSignal to cancel async operations (e.g. subtitle load timeout) on unmount */
  signal?: AbortSignal
}

/**
 * JASSUB action type for ASS/SSA subtitle handling.
 */
export type JassubAction = 'initialize' | 'dispose'

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

// ============================================================================
// URL Generation
// ============================================================================

/**
 * Generates a subtitle delivery URL for fetching external subtitles.
 *
 * @param itemId - The media item ID
 * @param trackIndex - The subtitle track index
 * @param format - The desired subtitle format (default: 'vtt')
 * @returns The subtitle delivery URL
 */
function getSubtitleDeliveryUrl(
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
): string {
  return getVideoStreamUrl({ itemId }, audioStreamIndex)
}

// ============================================================================
// Index Mapping Utilities
// ============================================================================

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

// ============================================================================
// HLS Audio Track Switching
// ============================================================================

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
    return {
      success: false,
      error: {
        type: 'api_unsupported',
        message: 'HLS instance not available',
        trackIndex,
      },
    }
  }

  // Validate that the track exists in our list
  if (audioTracks && audioTracks.length > 0) {
    const targetTrack = audioTracks.find((t) => t.index === trackIndex)
    if (!targetTrack) {
      return {
        success: false,
        error: {
          type: 'track_unavailable',
          message: `Audio track with MediaStream index ${trackIndex} not found in track list`,
          trackIndex,
        },
      }
    }
  }

  // Check if HLS.js actually has multiple audio tracks in the manifest
  const hlsAudioTracks = hlsInstance.audioTracks

  // If HLS.js has multiple audio tracks, we can try to switch directly
  if (hlsAudioTracks.length > 1) {
    let relativeIndex = -1

    if (audioTracks && audioTracks.length > 0) {
      // Try to find matching track by language
      const targetTrack = audioTracks.find((t) => t.index === trackIndex)
      if (targetTrack?.language) {
        const targetLang = targetTrack.language.toLowerCase()
        const hlsTrackIndex = hlsAudioTracks.findIndex(
          (hlsTrack) =>
            hlsTrack.lang?.toLowerCase() === targetLang ||
            (hlsTrack.name && hlsTrack.name.toLowerCase().includes(targetLang)),
        )
        if (hlsTrackIndex !== -1) {
          relativeIndex = hlsTrackIndex
        }
      }

      // Fallback to position-based matching
      if (relativeIndex === -1) {
        const trackPosition = audioTracks.findIndex(
          (t) => t.index === trackIndex,
        )
        if (trackPosition !== -1 && trackPosition < hlsAudioTracks.length) {
          relativeIndex = trackPosition
        }
      }
    }

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

// ============================================================================
// Direct Play Audio Track Switching
// ============================================================================

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
  const { videoElement, audioTracks, itemId, onReloadHls } = options

  // Check if native AudioTrack API is available
  const videoWithTracks = videoElement as HTMLVideoElementWithAudioTracks
  const nativeAudioTracks = videoWithTracks.audioTracks

  // Find the target track
  const targetTrack = audioTracks?.find((t) => t.index === trackIndex)
  if (!targetTrack) {
    return {
      success: false,
      error: {
        type: 'track_unavailable',
        message: `Audio track with index ${trackIndex} not found`,
        trackIndex,
      },
    }
  }

  // Strategy 1: Try native AudioTrack API (Safari, some Chromium)
  if (nativeAudioTracks && nativeAudioTracks.length > 1) {
    // Try relativeIndex first
    if (
      targetTrack.relativeIndex >= 0 &&
      targetTrack.relativeIndex < nativeAudioTracks.length
    ) {
      for (let i = 0; i < nativeAudioTracks.length; i++) {
        nativeAudioTracks[i].enabled = i === targetTrack.relativeIndex
      }
      return { success: true }
    }

    // Try language matching
    if (targetTrack.language) {
      const langLower = targetTrack.language.toLowerCase()
      for (let i = 0; i < nativeAudioTracks.length; i++) {
        const nativeTrack = nativeAudioTracks[i]
        const nativeLang = nativeTrack.language.toLowerCase()
        if (
          nativeLang === langLower ||
          nativeLang.startsWith(langLower.slice(0, 2)) ||
          langLower.startsWith(nativeLang.slice(0, 2))
        ) {
          for (let j = 0; j < nativeAudioTracks.length; j++) {
            nativeAudioTracks[j].enabled = j === i
          }
          return { success: true }
        }
      }
    }

    // Try position-based matching
    const trackPosition =
      audioTracks?.findIndex((t) => t.index === trackIndex) ?? -1
    if (trackPosition >= 0 && trackPosition < nativeAudioTracks.length) {
      for (let i = 0; i < nativeAudioTracks.length; i++) {
        nativeAudioTracks[i].enabled = i === trackPosition
      }
      return { success: true }
    }
  }

  // Strategy 2: Fall back to HLS transcoding with selected audio track
  // This is the only way to switch audio in Chrome/Firefox for direct play content
  if (!itemId) {
    return {
      success: false,
      error: {
        type: 'api_unsupported',
        message:
          'Audio track switching requires transcoding in this browser. Item ID not available.',
        trackIndex,
      },
    }
  }

  if (!onReloadHls) {
    return {
      success: false,
      error: {
        type: 'api_unsupported',
        message:
          'Audio track switching requires transcoding in this browser. Please wait for the stream to reload.',
        trackIndex,
      },
    }
  }

  // Generate HLS URL with the selected audio track and trigger reload
  const newUrl = getHlsUrlWithAudioTrack(itemId, trackIndex)
  if (!newUrl) {
    return {
      success: false,
      error: {
        type: 'network_error',
        message: 'Failed to generate HLS URL for audio track switching',
        trackIndex,
      },
    }
  }

  // Trigger HLS reload - this will switch from direct play to HLS mode
  try {
    await onReloadHls(newUrl)
  } catch (err) {
    return {
      success: false,
      error: {
        type: 'unknown_error',
        message:
          err instanceof Error
            ? err.message
            : 'Failed to reload HLS stream for audio track switching',
        trackIndex,
      },
    }
  }

  return { success: true, reloadRequired: true }
}

// ============================================================================
// HLS Subtitle Switching
// ============================================================================

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

// ============================================================================
// Direct Play Subtitle Switching
// ============================================================================

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
    Array.from(textTracks).forEach((track) => {
      track.mode = 'hidden'
    })
    removeManagedSubtitleTracks(videoElement)
    return { success: true }
  }

  // Map MediaStream index to relative index for TextTrack array access
  let relativeIndex: number
  if (subtitleTracks && subtitleTracks.length > 0) {
    relativeIndex = mapToRelativeIndex(trackIndex, subtitleTracks)
    if (relativeIndex === -1) {
      // Track not found in our list - may need to fetch external subtitle
      // Fall through to external subtitle handling
    }
  } else {
    // Fallback: assume trackIndex is already a relative index (legacy behavior)
    relativeIndex = trackIndex
  }

  // Check if track exists in TextTracks using relativeIndex
  if (
    relativeIndex !== -1 &&
    relativeIndex >= 0 &&
    relativeIndex < textTracks.length
  ) {
    // Hide all tracks first
    Array.from(textTracks).forEach((track) => {
      track.mode = 'hidden'
    })
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

    // Hide all existing tracks
    Array.from(textTracks).forEach((existingTrack) => {
      existingTrack.mode = 'hidden'
    })

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
    const newTrackIndex = textTracks.length - 1
    if (newTrackIndex >= 0) {
      textTracks[newTrackIndex].mode = 'showing'
    }

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

// ============================================================================
// Unified Track Switching Functions
// ============================================================================

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
      if (!options.itemId) {
        return {
          success: false,
          error: {
            type: 'api_unsupported',
            message: 'Item ID required for HLS audio track switching',
            trackIndex,
          },
        }
      }

      if (!options.onReloadHls) {
        return {
          success: false,
          error: {
            type: 'api_unsupported',
            message: 'HLS reload callback not provided',
            trackIndex,
          },
        }
      }

      // Generate new HLS URL with the selected audio track
      // Note: We don't pass currentTime here because the HLS player hook
      // will preserve and restore the playback position automatically
      const newUrl = getHlsUrlWithAudioTrack(options.itemId, trackIndex)

      if (!newUrl) {
        return {
          success: false,
          error: {
            type: 'network_error',
            message: 'Failed to generate HLS URL with audio track',
            trackIndex,
          },
        }
      }

      // Trigger the reload
      try {
        await options.onReloadHls(newUrl)
      } catch (err) {
        return {
          success: false,
          error: {
            type: 'unknown_error',
            message:
              err instanceof Error
                ? err.message
                : 'Failed to reload HLS stream with new audio track',
            trackIndex,
          },
        }
      }

      return { success: true, reloadRequired: true }
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
    // Hide all TextTracks (for non-ASS tracks that may be showing)
    const textTracks = options.videoElement.textTracks
    Array.from(textTracks).forEach((track) => {
      track.mode = 'hidden'
    })

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
    // Hide any existing TextTracks before JASSUB takes over
    const textTracks = options.videoElement.textTracks
    Array.from(textTracks).forEach((existingTrack) => {
      existingTrack.mode = 'hidden'
    })

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
