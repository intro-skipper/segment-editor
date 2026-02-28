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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
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
 */
interface UseTrackManagerOptions {
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
  onReloadHls?: (newUrl: string) => Promise<void>
}

/**
 * Return value from the useTrackManager hook.
 */
interface UseTrackManagerReturn {
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

interface UserTrackSelectionState {
  key: string
  hasAudioSelection: boolean
  audioIndex: number
  hasSubtitleSelection: boolean
  subtitleIndex: number | null
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
 */
export function useTrackManager({
  item,
  strategy,
  videoRef,
  hlsRef,
  t,
  onReloadHls,
}: UseTrackManagerOptions): UseTrackManagerReturn {
  // Only store explicit user track picks; defaults are derived during render.
  const [userSelection, setUserSelection] = useState<UserTrackSelectionState>({
    key: '',
    hasAudioSelection: false,
    audioIndex: 0,
    hasSubtitleSelection: false,
    subtitleIndex: null,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // AbortController for cancelling in-flight subtitle load operations on unmount
  const abortControllerRef = useRef<AbortController>(new AbortController())
  useEffect(() => {
    const controller = new AbortController()
    abortControllerRef.current = controller
    return () => {
      controller.abort()
    }
  }, [])

  // Get track preferences from app store
  const {
    preferredAudioLanguage,
    preferredSubtitleLanguage,
    subtitlesEnabled,
  } = useAppStore(
    useShallow((state: ReturnType<typeof useAppStore.getState>) => ({
      preferredAudioLanguage: state.trackPreferences.preferredAudioLanguage,
      preferredSubtitleLanguage:
        state.trackPreferences.preferredSubtitleLanguage,
      subtitlesEnabled: state.trackPreferences.subtitlesEnabled,
    })),
  )

  // ============================================================================
  // Track Lists
  // ============================================================================

  /**
   * Extract tracks from item - computed directly during render.
   */
  const { audioTracks, subtitleTracks } = useMemo(() => {
    if (!item) {
      return { audioTracks: [], subtitleTracks: [] }
    }
    return extractTracks(item as Parameters<typeof extractTracks>[0])
  }, [item])

  const itemId = item?.Id ?? undefined

  const trackResetKey = useMemo(
    () =>
      [
        itemId ?? '',
        preferredAudioLanguage ?? '',
        preferredSubtitleLanguage ?? '',
        subtitlesEnabled ? '1' : '0',
        audioTracks.length,
        subtitleTracks.length,
      ].join('|'),
    [
      itemId,
      preferredAudioLanguage,
      preferredSubtitleLanguage,
      subtitlesEnabled,
      audioTracks.length,
      subtitleTracks.length,
    ],
  )

  const preferredAudioIndex = itemId
    ? findPreferredAudioIndex(audioTracks, preferredAudioLanguage)
    : 0

  const preferredSubtitleIndex = itemId
    ? findPreferredSubtitleIndex(
        subtitleTracks,
        preferredSubtitleLanguage,
        subtitlesEnabled,
      )
    : null

  const activeAudioIndex =
    userSelection.key === trackResetKey && userSelection.hasAudioSelection
      ? userSelection.audioIndex
      : preferredAudioIndex

  const activeSubtitleIndex =
    userSelection.key === trackResetKey && userSelection.hasSubtitleSelection
      ? userSelection.subtitleIndex
      : preferredSubtitleIndex

  /**
   * Combine track lists and active indices into trackState.
   * This is computed directly during render, not stored in state.
   */
  const trackState: TrackState = useMemo(
    () => ({
      audioTracks,
      subtitleTracks,
      activeAudioIndex,
      activeSubtitleIndex,
    }),
    [audioTracks, subtitleTracks, activeAudioIndex, activeSubtitleIndex],
  )

  // ============================================================================
  // Track Switching Options
  // ============================================================================

  const mediaSourceId = item?.MediaSources?.[0]?.Id ?? undefined

  const audioTrackMap = useMemo(
    () => new Map(audioTracks.map((track) => [track.index, track])),
    [audioTracks],
  )

  const subtitleTrackMap = useMemo(
    () => new Map(subtitleTracks.map((track) => [track.index, track])),
    [subtitleTracks],
  )

  const createSwitchOptions = useCallback(
    (videoElement: HTMLVideoElement) => ({
      strategy,
      videoElement,
      hlsInstance: hlsRef?.current,
      itemId,
      mediaSourceId,
      audioTracks,
      subtitleTracks,
      onReloadHls,
      signal: abortControllerRef.current.signal,
    }),
    [
      strategy,
      hlsRef,
      itemId,
      mediaSourceId,
      audioTracks,
      subtitleTracks,
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
   */
  const selectAudioTrack = useCallback(
    async (index: number): Promise<void> => {
      const video = videoRef.current
      if (!video) {
        setError(t('player.tracks.error.noVideo'))
        return
      }

      // Validate track index
      const track = audioTrackMap.get(index)
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
          ...createSwitchOptions(video),
        })

        if (result.success) {
          setUserSelection((prev) =>
            prev.key === trackResetKey
              ? { ...prev, hasAudioSelection: true, audioIndex: index }
              : {
                  key: trackResetKey,
                  hasAudioSelection: true,
                  audioIndex: index,
                  hasSubtitleSelection: false,
                  subtitleIndex: null,
                },
          )
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
      t,
      audioTrackMap,
      trackState.activeAudioIndex,
      createSwitchOptions,
      trackResetKey,
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
        const track = subtitleTrackMap.get(index)
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
          ...createSwitchOptions(video),
        })

        if (result.success) {
          setUserSelection((prev) =>
            prev.key === trackResetKey
              ? {
                  ...prev,
                  hasSubtitleSelection: true,
                  subtitleIndex: index,
                }
              : {
                  key: trackResetKey,
                  hasAudioSelection: false,
                  audioIndex: 0,
                  hasSubtitleSelection: true,
                  subtitleIndex: index,
                },
          )
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
      t,
      subtitleTrackMap,
      trackState.activeSubtitleIndex,
      createSwitchOptions,
      trackResetKey,
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
