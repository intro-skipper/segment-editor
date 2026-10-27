/**
 * Track switching service for audio and subtitle track management.
 * Supports both HLS.js and direct play (native HTML5) modes.
 *
 * @module services/video/track-switching
 */

import type { AudioTrackInfo, SubtitleTrackInfo } from '@/services/video/tracks'
import type { PlaybackStrategy } from '@/services/video/api'
import { getContainerDefaultAudioTrack } from '@/services/video/tracks'
import { getVideoStreamUrl } from '@/services/video/api'
import { createPlaySessionId } from '@/services/video/session'
import { isAudioTrackDecodable } from '@/services/video/compatibility'

/**
 * The hls.js surface this module drives. Declaring it structurally keeps the
 * dependency to the members track switching actually touches, so callers and
 * tests supply those rather than a whole Hls instance.
 */
export interface HlsTrackController {
  readonly audioTracks: ReadonlyArray<{ lang?: string; name?: string }>
  audioTrack: number
}

/**
 * The media element surface track switching drives; `HTMLVideoElement`
 * satisfies it. `textTracks` lists the <track> captions in subtitle stream
 * order, so a subtitle's `relativeIndex` addresses its text track.
 */
export interface TrackMedia {
  readonly audioTracks?: AudioTrackList
  readonly textTracks: ArrayLike<{ mode: TextTrackMode }>
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
export interface TrackSwitchOptions {
  /** Current playback strategy (direct or hls) */
  strategy: PlaybackStrategy
  /** The media element whose audio and text tracks switch */
  videoElement: TrackMedia
  /** HLS.js instance for HLS mode operations */
  hlsInstance?: HlsTrackController | null
  /** Audio tracks for index mapping (required for HLS mode) */
  audioTracks?: Array<AudioTrackInfo>
  /** Subtitle tracks for index mapping */
  subtitleTracks?: Array<SubtitleTrackInfo>
  /** Item ID for URL generation (needed for reload fallback) */
  itemId: string
  /** Media source ID for URL generation */
  mediaSourceId?: string
  /** Callback to reload HLS stream with new URL (for audio track switching in HLS mode) */
  onReloadHls: (reload: HlsReloadRequest) => Promise<void>
  /** AbortSignal that cancels stale async operations (native audio wait, transcode reload) */
  signal?: AbortSignal
  /**
   * How long to wait for the native audio track list to populate after
   * `loadedmetadata`, in milliseconds. Defaults to 0 (read the list
   * immediately); the initial application passes a real wait because it runs
   * right after `loadedmetadata`, before the browser finishes parsing tracks.
   */
  nativeTrackTimeoutMs?: number
}

/** Default wait for the native audio track list to populate. */
const NATIVE_AUDIO_TRACK_TIMEOUT_MS = 1000

export interface HlsReloadRequest {
  url: string
  playSessionId: string
}

/**
 * Result of a track switching operation. Discriminated on `success`, so a
 * failure always carries its error and the success-only fields cannot appear
 * on a failure.
 */
export type TrackSwitchResult =
  | {
      success: true
      /** Whether a reload was required (direct play fallback) */
      reloadRequired?: boolean
    }
  | {
      success: false
      /** Error information for the failed switch */
      error: TrackSwitchError
    }

/**
 * An HLS request for audio stream `audioStreamIndex` under a new play session.
 * No StartTimeTicks: the playback engine carries the position across the reload.
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
  hlsAudioTracks: ReadonlyArray<{ lang?: string; name?: string }>,
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
    const shouldBeEnabled = i === enabledIndex
    // Only write on an actual change: assigning `enabled` fires a `change`
    // event on the track list even when the value is unchanged, and the
    // initial selection re-runs whenever the stream reloads.
    if (nativeAudioTracks[i].enabled !== shouldBeEnabled) {
      nativeAudioTracks[i].enabled = shouldBeEnabled
    }
  }
}

/**
 * Tries to activate an audio track through the native AudioTrack API.
 *
 * A browser exposing the API can still be unable to decode the target track
 * (e.g. DTS): enabling it would play silence, so those switches report
 * failure and the caller transcodes instead.
 *
 * @returns true when the native track was enabled, false when the caller
 *   must fall back to an HLS transcode
 */
async function tryEnableNativeAudioTrack(
  trackIndex: number,
  targetTrack: AudioTrackInfo,
  options: TrackSwitchOptions,
): Promise<boolean> {
  const nativeAudioTracks = options.videoElement.audioTracks
  if (!nativeAudioTracks) {
    return false
  }

  // The decoder probe and the track-list wait are independent, so they run
  // overlapped; awaiting the probe first keeps the undecodable early-exit
  // from paying the track-list timeout (the wait self-cleans on timeout or
  // abort when left behind).
  const trackListPopulated = waitForNativeAudioTracks(
    nativeAudioTracks,
    options.nativeTrackTimeoutMs ?? 0,
    options.signal,
  )

  const codecDecodable = await isAudioTrackDecodable(targetTrack)
  if (!codecDecodable || options.signal?.aborted) {
    return false
  }

  await trackListPopulated

  // The request went stale while waiting (newer selection, item change,
  // unmount): enabling a track now would fight the newer state.
  if (options.signal?.aborted) {
    return false
  }

  if (nativeAudioTracks.length <= 1) {
    return false
  }

  const nativeTrackIndex = findNativeAudioTrackIndex(
    trackIndex,
    targetTrack,
    nativeAudioTracks,
    options.audioTracks,
  )
  if (nativeTrackIndex === -1) {
    return false
  }

  enableOnlyNativeAudioTrack(nativeAudioTracks, nativeTrackIndex)
  return true
}

/**
 * Waits for the native audio track list to expose more than one track.
 *
 * Browsers populate `audioTracks` while parsing the container, which can lag
 * behind `loadedmetadata`. Resolves early on `addtrack` or when the signal
 * aborts, and after the timeout with whatever the list holds so the caller
 * can fall back. `AudioTrackList` is live, so the caller keeps reading the
 * list it passed in.
 */
async function waitForNativeAudioTracks(
  nativeAudioTracks: AudioTrackList,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<void> {
  if (nativeAudioTracks.length > 1 || timeoutMs <= 0 || signal?.aborted) {
    return
  }

  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timeoutId)
      nativeAudioTracks.removeEventListener('addtrack', handleAddTrack)
      signal?.removeEventListener('abort', finish)
      resolve()
    }

    const handleAddTrack = () => {
      if (nativeAudioTracks.length > 1) finish()
    }

    const timeoutId = setTimeout(finish, timeoutMs)
    nativeAudioTracks.addEventListener('addtrack', handleAddTrack)
    signal?.addEventListener('abort', finish)
  })
}

/**
 * Turns every text track off. 'disabled', not 'hidden': the browser fetches
 * a hidden <track>, so hiding would download every subtitle stream.
 */
function disableTextTracks(
  textTracks: ArrayLike<{ mode: TextTrackMode }>,
): void {
  Array.from(textTracks).forEach((track) => {
    track.mode = 'disabled'
  })
}

interface HlsReloadMessages {
  urlGenerationFailed: string
  reloadFailed: string
}

/** Messages for the direct-play → HLS transcode fallback paths. */
const DIRECT_PLAY_HLS_FALLBACK_MESSAGES: HlsReloadMessages = {
  urlGenerationFailed: 'Failed to generate HLS URL for audio track switching',
  reloadFailed: 'Failed to reload HLS stream for audio track switching',
}

async function reloadHlsAudioTrack(
  trackIndex: number,
  options: TrackSwitchOptions,
  messages: HlsReloadMessages,
): Promise<TrackSwitchResult> {
  // A stale request (newer selection, item change, unmount) must not restart
  // the stream as a transcode for an outdated index. The no-op success is
  // discarded along with the rest of the aborted operation's result.
  if (options.signal?.aborted) {
    return { success: true }
  }

  const { itemId, mediaSourceId, onReloadHls } = options

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
  hlsInstance: HlsTrackController | null | undefined,
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
  const targetTrack = findTrackByMediaStreamIndex(
    options.audioTracks,
    trackIndex,
  )
  if (!targetTrack) {
    return createTrackSwitchError(
      'track_unavailable',
      `Audio track with index ${trackIndex} not found`,
      trackIndex,
    )
  }

  // Strategy 1: Try native AudioTrack API (Safari, some Chromium)
  if (await tryEnableNativeAudioTrack(trackIndex, targetTrack, options)) {
    return { success: true }
  }

  // Strategy 2: Fall back to HLS transcoding with selected audio track
  // This is the only way to switch audio in Chrome/Firefox for direct play content
  return reloadHlsAudioTrack(
    trackIndex,
    options,
    DIRECT_PLAY_HLS_FALLBACK_MESSAGES,
  )
}

/**
 * Applies the initially selected audio track once direct play has metadata.
 *
 * Direct play always starts on the container's default track, so a session
 * that starts on any other track has to enable the matching native track. When
 * the native list never populates, holds no match, or the track cannot be
 * decoded, the stream reloads as an HLS transcode with the requested
 * `AudioStreamIndex` instead of silently playing the wrong audio.
 *
 * When `options.signal` aborts (newer selection, item change, unmount), the
 * pending application becomes a no-op instead of enabling a stale track or
 * reloading the stream for an outdated index.
 *
 * @param trackIndex - The Jellyfin MediaStream index of the audio track to activate
 * @param options - Track switch options (call after `loadedmetadata`)
 * @returns Promise resolving to the result of the operation
 */
export async function applyInitialAudioTrack(
  trackIndex: number,
  options: TrackSwitchOptions,
): Promise<TrackSwitchResult> {
  const { strategy, audioTracks, signal } = options

  if (strategy !== 'direct' || signal?.aborted) {
    return { success: true }
  }

  // The container default is already playing; nothing to enable.
  const defaultTrack = getContainerDefaultAudioTrack(audioTracks ?? [])
  if (defaultTrack?.index === trackIndex) {
    return { success: true }
  }

  return switchDirectPlayAudioTrack(trackIndex, {
    ...options,
    nativeTrackTimeoutMs:
      options.nativeTrackTimeoutMs ?? NATIVE_AUDIO_TRACK_TIMEOUT_MS,
  })
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
        urlGenerationFailed: 'Failed to generate HLS URL with audio track',
        reloadFailed: 'Failed to reload HLS stream with new audio track',
      })
    }

    return result
  }
  return switchDirectPlayAudioTrack(trackIndex, options)
}

/**
 * Shows one subtitle through its text track in either strategy, or none
 * for null.
 *
 * @param trackIndex - The Jellyfin MediaStream index of the subtitle track to show, or null for off
 * @param options - Track switch options (includes subtitleTracks for index mapping)
 * @returns Promise resolving to the result of the switch operation
 */
export async function switchSubtitleTrack(
  trackIndex: number | null,
  options: TrackSwitchOptions,
): Promise<TrackSwitchResult> {
  const textTracks = options.videoElement.textTracks
  if (trackIndex === null) {
    disableTextTracks(textTracks)
    return { success: true }
  }

  const track = options.subtitleTracks?.find((t) => t.index === trackIndex)
  if (!track) {
    return createTrackSwitchError(
      'track_unavailable',
      `Subtitle track with index ${trackIndex} not found`,
      trackIndex,
    )
  }

  if (track.relativeIndex >= textTracks.length) {
    return createTrackSwitchError(
      'track_unavailable',
      `Subtitle track with index ${trackIndex} has no text track`,
      trackIndex,
    )
  }

  disableTextTracks(textTracks)
  textTracks[track.relativeIndex].mode = 'showing'
  return { success: true }
}
