/**
 * useTrackManager - Hook for managing audio and subtitle track selection.
 *
 * Features:
 * - Extracts available tracks from media item
 * - Handles track switching for both HLS and direct play modes
 * - Manages active track state
 * - Provides error handling with notifications
 * - Auto-selects tracks based on user preferences
 *
 * @module hooks/use-track-manager
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import type Hls from 'hls.js'
import type { BaseItemDto } from '@/types/jellyfin'
import type { PlaybackStrategy } from '@/services/video/api'
import type { TrackSwitchResult } from '@/services/video/track-switching'
import type {
  AudioTrackInfo,
  SubtitleTrackInfo,
  TrackState,
} from '@/services/video/tracks'
import { extractTracks } from '@/services/video/tracks'
import {
  switchAudioTrack,
  switchSubtitleTrack,
} from '@/services/video/track-switching'
import { showError } from '@/lib/notifications'
import { languagesMatch } from '@/lib/language-utils'
import { useAppStore } from '@/stores/app-store'

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Options for the useTrackManager hook.
 *
 * Requirements: 1.1, 2.1
 */
export interface UseTrackManagerOptions {
  /** The Jellyfin item containing media source information */
  item: BaseItemDto | null
  /** Current playback strategy (direct or hls) */
  strategy: PlaybackStrategy
  /** Ref to the video element */
  videoRef: React.RefObject<HTMLVideoElement | null>
  /** Ref to the HLS.js instance (required for HLS mode) */
  hlsRef?: React.RefObject<Hls | null>
  /** Translation function for error messages */
  t: (key: string) => string
  /** Callback to reload HLS stream with new URL (for audio track switching) */
  onReloadHls?: (newUrl: string) => void
}

/**
 * Return value from the useTrackManager hook.
 *
 * Requirements: 1.1, 2.1
 */
export interface UseTrackManagerReturn {
  /** Current state of available and active tracks */
  trackState: TrackState
  /** Select an audio track by index */
  selectAudioTrack: (index: number) => Promise<void>
  /** Select a subtitle track by index, or null to turn off subtitles */
  selectSubtitleTrack: (index: number | null) => Promise<void>
  /** Whether a track switch operation is in progress */
  isLoading: boolean
  /** Current error message, if any */
  error: string | null
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default empty track state.
 */
const EMPTY_TRACK_STATE: TrackState = {
  audioTracks: [],
  subtitleTracks: [],
  activeAudioIndex: 0,
  activeSubtitleIndex: null,
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Finds the best audio track index based on preferences.
 * Priority: 1) Matching preferred language, 2) Default track, 3) First track
 */
function findPreferredAudioIndex(
  audioTracks: Array<AudioTrackInfo>,
  preferredLanguage: string | null,
): number {
  if (preferredLanguage) {
    const preferredTrack = audioTracks.find((track) =>
      languagesMatch(track.language, preferredLanguage),
    )
    if (preferredTrack) return preferredTrack.index
  }

  const defaultTrack = audioTracks.find((track) => track.isDefault)
  if (defaultTrack) return defaultTrack.index

  return audioTracks.length > 0 ? audioTracks[0].index : 0
}

/**
 * Finds the best subtitle track index based on preferences.
 * Priority: 1) Matching preferred language (if enabled), 2) Default track (if enabled), 3) null (off)
 */
function findPreferredSubtitleIndex(
  subtitleTracks: Array<SubtitleTrackInfo>,
  preferredLanguage: string | null,
  subtitlesEnabled: boolean,
): number | null {
  if (!subtitlesEnabled) return null

  if (preferredLanguage) {
    const preferredTrack = subtitleTracks.find((track) =>
      languagesMatch(track.language, preferredLanguage),
    )
    if (preferredTrack) return preferredTrack.index
  }

  const defaultTrack = subtitleTracks.find((track) => track.isDefault)
  if (defaultTrack) return defaultTrack.index

  return null
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Hook for managing audio and subtitle track selection.
 *
 * This hook extracts available tracks from a media item and provides
 * functions to switch between them. It handles both HLS and direct play
 * modes, delegating to the appropriate switching service.
 *
 * Auto-selects tracks based on user preferences stored in the app store.
 *
 * @param options - Hook options including item, strategy, and refs
 * @returns Track state and selection functions
 *
 * Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.2, 7.4, 7.5
 */
export function useTrackManager({
  item,
  strategy,
  videoRef,
  hlsRef,
  t,
  onReloadHls,
}: UseTrackManagerOptions): UseTrackManagerReturn {
  const [trackState, setTrackState] = useState<TrackState>(EMPTY_TRACK_STATE)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get track preferences from app store
  const trackPreferences = useAppStore((state) => state.trackPreferences)

  // Track previous item to detect changes
  const prevItemRef = useRef(item)
  const prevPreferencesRef = useRef(trackPreferences)

  // ============================================================================
  // Track State Initialization
  // ============================================================================

  /**
   * Extract tracks from item when it changes.
   * Sets initial active indices based on user preferences, falling back to defaults.
   *
   * Requirements: 1.1, 2.1, 7.2, 7.4, 7.5
   */
  if (
    item !== prevItemRef.current ||
    trackPreferences !== prevPreferencesRef.current
  ) {
    prevItemRef.current = item
    prevPreferencesRef.current = trackPreferences

    if (!item) {
      if (trackState !== EMPTY_TRACK_STATE) {
        setTrackState(EMPTY_TRACK_STATE)
        setError(null)
      }
    } else {
      // extractTracks handles null/undefined MediaSources internally
      const { audioTracks, subtitleTracks } = extractTracks(
        item as Parameters<typeof extractTracks>[0],
      )

      // Find preferred track indices based on user preferences
      const activeAudioIndex = findPreferredAudioIndex(
        audioTracks,
        trackPreferences.preferredAudioLanguage,
      )
      const activeSubtitleIndex = findPreferredSubtitleIndex(
        subtitleTracks,
        trackPreferences.preferredSubtitleLanguage,
        trackPreferences.subtitlesEnabled,
      )

      setTrackState({
        audioTracks,
        subtitleTracks,
        activeAudioIndex,
        activeSubtitleIndex,
      })
      setError(null)
    }
  }

  // ============================================================================
  // Track Switching Options
  // ============================================================================

  /**
   * Memoized track switch options to avoid recreating on every render.
   * Includes audioTracks and subtitleTracks for proper index mapping.
   *
   * Requirements: 5.4
   */
  const switchOptions = useMemo(
    () => ({
      strategy,
      videoElement: videoRef.current!,
      hlsInstance: hlsRef?.current,
      itemId: item?.Id,
      mediaSourceId: item?.MediaSources?.[0]?.Id ?? undefined,
      audioTracks: trackState.audioTracks,
      subtitleTracks: trackState.subtitleTracks,
      onReloadHls,
    }),
    [
      strategy,
      videoRef,
      hlsRef,
      item?.Id,
      item?.MediaSources,
      trackState.audioTracks,
      trackState.subtitleTracks,
      onReloadHls,
    ],
  )

  // ============================================================================
  // Audio Track Selection
  // ============================================================================

  /**
   * Selects an audio track by index.
   * Calls the appropriate switching service based on playback strategy.
   *
   * @param index - The audio track index to select
   *
   * Requirements: 3.1, 4.1
   */
  const selectAudioTrack = useCallback(
    async (index: number): Promise<void> => {
      const video = videoRef.current
      if (!video) {
        setError(t('player.tracks.error.noVideo'))
        return
      }

      // Validate track index
      const track = trackState.audioTracks.find((trk) => trk.index === index)
      if (!track) {
        const errorMsg = t('player.tracks.error.trackNotFound')
        setError(errorMsg)
        showError(errorMsg)
        return
      }

      // Skip if already active
      if (index === trackState.activeAudioIndex) {
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const result: TrackSwitchResult = await switchAudioTrack(index, {
          ...switchOptions,
          videoElement: video,
          hlsInstance: hlsRef?.current,
        })

        if (result.success) {
          setTrackState((prev) => ({
            ...prev,
            activeAudioIndex: index,
          }))
        } else if (result.error) {
          const errorMsg =
            result.error.message || t('player.tracks.error.switchFailed')
          setError(errorMsg)
          showError(errorMsg)
        }
      } catch (err) {
        const errorMsg =
          err instanceof Error
            ? err.message
            : t('player.tracks.error.switchFailed')
        setError(errorMsg)
        showError(errorMsg)
      } finally {
        setIsLoading(false)
      }
    },
    [
      videoRef,
      hlsRef,
      trackState.audioTracks,
      trackState.activeAudioIndex,
      switchOptions,
      t,
    ],
  )

  // ============================================================================
  // Subtitle Track Selection
  // ============================================================================

  /**
   * Selects a subtitle track by index, or turns off subtitles if null.
   * Calls the appropriate switching service based on playback strategy.
   *
   * @param index - The subtitle track index to select, or null for off
   *
   * Requirements: 5.1, 6.1
   */
  const selectSubtitleTrack = useCallback(
    async (index: number | null): Promise<void> => {
      const video = videoRef.current
      if (!video) {
        setError(t('player.tracks.error.noVideo'))
        return
      }

      // Validate track index if not turning off
      if (index !== null) {
        const track = trackState.subtitleTracks.find(
          (trk) => trk.index === index,
        )
        if (!track) {
          const errorMsg = t('player.tracks.error.trackNotFound')
          setError(errorMsg)
          showError(errorMsg)
          return
        }
      }

      // Skip if already active
      if (index === trackState.activeSubtitleIndex) {
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const result: TrackSwitchResult = await switchSubtitleTrack(index, {
          ...switchOptions,
          videoElement: video,
          hlsInstance: hlsRef?.current,
        })

        if (result.success) {
          setTrackState((prev) => ({
            ...prev,
            activeSubtitleIndex: index,
          }))
        } else if (result.error) {
          const errorMsg =
            result.error.message || t('player.tracks.error.switchFailed')
          setError(errorMsg)
          showError(errorMsg)
        }
      } catch (err) {
        const errorMsg =
          err instanceof Error
            ? err.message
            : t('player.tracks.error.switchFailed')
        setError(errorMsg)
        showError(errorMsg)
      } finally {
        setIsLoading(false)
      }
    },
    [
      videoRef,
      hlsRef,
      trackState.subtitleTracks,
      trackState.activeSubtitleIndex,
      switchOptions,
      t,
    ],
  )

  // ============================================================================
  // Return Value
  // ============================================================================

  return {
    trackState,
    selectAudioTrack,
    selectSubtitleTrack,
    isLoading,
    error,
  }
}
