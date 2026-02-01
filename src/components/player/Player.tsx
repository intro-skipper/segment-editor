/**
 * Player - Video player with direct play support and HLS fallback.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { AlertTriangle, Expand, RefreshCw, Shrink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/shallow'

import { PlayerScrubber } from './PlayerScrubber'
import { PlayerControls } from './PlayerControls'
import { initialPlayerState, playerReducer } from './player-reducer'
import type {
  BaseItemDto,
  MediaSegmentDto,
  MediaSegmentType,
} from '@/types/jellyfin'
import type {
  VideoPlayerError,
  VideoPlayerErrorType,
} from '@/hooks/use-video-player'
import type { HlsPlayerError } from '@/hooks/use-hls-player'
import type { CreateSegmentData, TimestampUpdate } from '@/types/segment'
import type { SessionStore } from '@/stores/session-store'
import type { PlaybackStrategy } from '@/services/video/api'
import { getBestImageUrl } from '@/services/video/api'
import { useBlobUrl } from '@/hooks/useBlobUrl'
import { useSessionStore } from '@/stores/session-store'
import { useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import { languagesMatch } from '@/lib/language-utils'
import { Button } from '@/components/ui/button'
import { useVideoPlayer } from '@/hooks/use-video-player'
import { useTrackManager } from '@/hooks/use-track-manager'
import { useJassubRenderer } from '@/hooks/use-jassub-renderer'
import { usePlayerKeyboard } from '@/hooks/use-player-keyboard'
import { useVibrantButtonStyle } from '@/hooks/use-vibrant-button-style'
import { showNotification } from '@/lib/notifications'
import { PLAYER_CONFIG } from '@/lib/constants'
import { extractTracks } from '@/services/video/tracks'

const {
  SKIP_TIMES,
  CONTROLS_HIDE_DELAY_MS,
  MOUSE_MOVE_THROTTLE_MS,
  DOUBLE_TAP_THRESHOLD_MS,
} = PLAYER_CONFIG

const selectPlayerState = (state: SessionStore) => ({
  vibrantColors: state.vibrantColors,
  persistedVolume: state.playerVolume,
  persistedMuted: state.playerMuted,
  setPlayerVolume: state.setPlayerVolume,
  setPlayerMuted: state.setPlayerMuted,
})

/**
 * Finds the preferred audio stream index based on language preference.
 * Returns undefined if no preference is set or no matching track is found.
 */
function findPreferredAudioStreamIndex(
  item: BaseItemDto,
  preferredLanguage: string | null,
): number | undefined {
  if (!preferredLanguage) return undefined

  const { audioTracks } = extractTracks(
    item as Parameters<typeof extractTracks>[0],
  )
  if (audioTracks.length === 0) return undefined

  const matchingTrack = audioTracks.find((track) =>
    languagesMatch(track.language, preferredLanguage),
  )

  return matchingTrack?.index
}

/** Maps VideoPlayerErrorType to HlsPlayerError type */
function mapVideoErrorType(type: VideoPlayerErrorType): HlsPlayerError['type'] {
  switch (type) {
    case 'media_error':
      return 'media'
    case 'network_error':
      return 'network'
    default:
      return 'unknown'
  }
}

export interface PlayerProps {
  item: BaseItemDto
  timestamp?: number
  segments?: Array<MediaSegmentDto>
  onCreateSegment: (data: CreateSegmentData) => void
  onUpdateSegmentTimestamp: (data: TimestampUpdate) => void
  className?: string
  /** Ref callback to expose getCurrentTime function to parent */
  getCurrentTimeRef?: React.MutableRefObject<(() => number) | null>
}

/**
 * Video player component with direct play support and HLS fallback.
 * Provides playback controls, segment creation, and keyboard shortcuts.
 */
export function Player({
  item,
  timestamp,
  segments,
  onCreateSegment,
  onUpdateSegmentTimestamp,
  className,
  getCurrentTimeRef,
}: PlayerProps) {
  const { t } = useTranslation()

  // Use extracted selector with useShallow to prevent unnecessary re-renders
  const {
    vibrantColors,
    persistedVolume,
    persistedMuted,
    setPlayerVolume,
    setPlayerMuted,
  } = useSessionStore(useShallow(selectPlayerState))

  const { getButtonStyle, iconColor, hasColors } =
    useVibrantButtonStyle(vibrantColors)

  const [state, dispatch] = useReducer(playerReducer, {
    ...initialPlayerState,
    volume: persistedVolume,
    isMuted: persistedMuted,
  })
  const {
    isPlaying,
    currentTime,
    duration,
    buffered,
    volume,
    isMuted,
    skipTimeIndex,
    playerError,
    isRecovering,
    subtitleOffset,
  } = state

  // Refs for stable callback references in skip operations
  const currentTimeRef = useRef(currentTime)
  const durationRef = useRef(duration)
  const previousStrategyRef = useRef<PlaybackStrategy | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false)
  // Track controls visibility in fullscreen (auto-hide)
  const [showFullscreenControls, setShowFullscreenControls] = useState(true)
  const hideControlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  // Video fit mode: 'contain' shows entire video, 'cover' fills screen (may crop)
  const [videoFitMode, setVideoFitMode] = useState<'contain' | 'cover'>(
    'contain',
  )
  // Unified single/double click/tap detection (used for both mouse and touch)
  const lastInteractionTimeRef = useRef(0)
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Throttle mouse move handler (only reset timer every 500ms)
  const lastMouseMoveRef = useRef(0)
  // Track rAF IDs for subtitle resize cleanup
  const resizeRafRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    currentTimeRef.current = currentTime
    durationRef.current = duration
  }, [currentTime, duration])

  // Expose getCurrentTime function to parent component
  useLayoutEffect(() => {
    if (getCurrentTimeRef) {
      getCurrentTimeRef.current = () => currentTimeRef.current
    }
    return () => {
      if (getCurrentTimeRef) {
        getCurrentTimeRef.current = null
      }
    }
  }, [getCurrentTimeRef])

  // Memoized poster URL - use blob URL to bypass COEP restrictions
  const rawPosterUrl = useMemo(
    () => getBestImageUrl(item, 900, 506) ?? null,
    [item],
  )
  const posterUrl = useBlobUrl(rawPosterUrl)

  // Video player error handler - memoized for stability
  const handleVideoError = useCallback((error: VideoPlayerError | null) => {
    if (error) {
      const hlsError: HlsPlayerError = {
        type: mapVideoErrorType(error.type),
        message: error.message,
        recoverable: error.recoverable,
      }
      dispatch({ type: 'ERROR_STATE', error: hlsError, isRecovering: false })
    } else {
      dispatch({ type: 'ERROR_STATE', error: null, isRecovering: false })
    }
  }, [])

  // Strategy change handler - shows notification on fallback
  const handleStrategyChange = useCallback(
    (strategy: PlaybackStrategy) => {
      // Show notification when falling back from direct play to HLS
      if (previousStrategyRef.current === 'direct' && strategy === 'hls') {
        showNotification({
          type: 'info',
          message: t('player.notification.switchedToTranscode'),
          duration: 3000,
        })
      }
      previousStrategyRef.current = strategy
    },
    [t],
  )

  // Get preferred audio language from app store for initial playback
  const preferredAudioLanguage = useAppStore(
    (s) => s.trackPreferences.preferredAudioLanguage,
  )

  // Compute preferred audio stream index for initial URL generation
  const preferredAudioStreamIndex = useMemo(
    () => findPreferredAudioStreamIndex(item, preferredAudioLanguage),
    [item, preferredAudioLanguage],
  )

  // Initialize video player via custom hook with direct play support
  const {
    videoRef,
    hlsRef,
    strategy,
    isLoading: isVideoLoading,
    error: videoError,
    retry: handleRetry,
    reloadHlsWithUrl,
  } = useVideoPlayer({
    item,
    preferredAudioStreamIndex,
    onError: handleVideoError,
    onStrategyChange: handleStrategyChange,
    t,
  })

  // Track preference setters from app store
  const setPreferredAudioLanguage = useAppStore(
    (s) => s.setPreferredAudioLanguage,
  )
  const setPreferredSubtitleLanguage = useAppStore(
    (s) => s.setPreferredSubtitleLanguage,
  )
  const setSubtitlesEnabled = useAppStore((s) => s.setSubtitlesEnabled)

  // Initialize track manager for audio/subtitle selection
  const {
    trackState,
    selectAudioTrack,
    selectSubtitleTrack,
    isLoading: isTrackLoading,
  } = useTrackManager({
    item,
    strategy,
    videoRef,
    hlsRef,
    t,
    onReloadHls: reloadHlsWithUrl,
  })

  // Get the active subtitle track for JASSUB renderer
  const activeSubtitleTrack = useMemo(() => {
    if (trackState.activeSubtitleIndex === null) {
      return null
    }
    return (
      trackState.subtitleTracks.find(
        (track) => track.index === trackState.activeSubtitleIndex,
      ) ?? null
    )
  }, [trackState.activeSubtitleIndex, trackState.subtitleTracks])

  // Initialize JASSUB renderer for ASS/SSA subtitles
  const { setUserOffset: setJassubUserOffset, resize: resizeJassub } =
    useJassubRenderer({
      videoRef,
      activeTrack: activeSubtitleTrack,
      item,
      transcodingOffsetTicks: 0, // TODO: Get from playback options when HLS transcoding offset is available
      userOffset: subtitleOffset,
      t,
    })

  // Handler for subtitle offset changes (ready for future UI integration)
  const _handleSubtitleOffsetChange = useCallback(
    (offset: number) => {
      dispatch({ type: 'SUBTITLE_OFFSET_CHANGE', offset })
      setJassubUserOffset(offset)
    },
    [setJassubUserOffset],
  )
  // Expose for future UI controls (e.g., subtitle sync adjustment)
  void _handleSubtitleOffsetChange

  // Sync video player error with reducer state
  useEffect(() => {
    if (videoError) {
      dispatch({
        type: 'ERROR_STATE',
        error: {
          type: mapVideoErrorType(videoError.type),
          message: videoError.message,
          recoverable: videoError.recoverable,
        },
        isRecovering: false,
      })
    }
  }, [videoError])

  // Handle external timestamp changes
  useEffect(() => {
    if (timestamp !== undefined && videoRef.current) {
      videoRef.current.currentTime = timestamp
    }
  }, [timestamp, videoRef])

  // Sync video element with persisted volume on mount
  useEffect(() => {
    const video = videoRef.current
    if (video) {
      video.volume = persistedVolume
      video.muted = persistedMuted
    }
  }, [videoRef, persistedVolume, persistedMuted])

  // Video event handlers - stable references
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      dispatch({
        type: 'PLAYBACK_UPDATE',
        currentTime: videoRef.current.currentTime,
      })
    }
  }, [videoRef])

  const handleDurationChange = useCallback(() => {
    if (videoRef.current) {
      dispatch({ type: 'MEDIA_LOADED', duration: videoRef.current.duration })
    }
  }, [videoRef])

  const handleProgress = useCallback(() => {
    const video = videoRef.current
    if (video?.buffered.length) {
      dispatch({
        type: 'BUFFER_UPDATE',
        buffered: video.buffered.end(video.buffered.length - 1),
      })
    }
  }, [videoRef])

  const handlePlay = useCallback(() => {
    dispatch({ type: 'PLAY_STATE', isPlaying: true })
  }, [])

  const handlePause = useCallback(() => {
    dispatch({ type: 'PLAY_STATE', isPlaying: false })
  }, [])

  // Playback controls
  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (video) video.paused ? video.play() : video.pause()
  }, [videoRef])

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (video) {
      video.muted = !video.muted
      dispatch({
        type: 'VOLUME_CHANGE',
        volume: state.volume,
        isMuted: video.muted,
      })
      setPlayerMuted(video.muted)
    }
  }, [videoRef, state.volume, setPlayerMuted])

  const handleVolumeChange = useCallback(
    (newVolume: number) => {
      const video = videoRef.current
      if (!video) return

      video.volume = newVolume

      // Determine mute state: mute if volume is 0, unmute if volume > 0 and was muted
      const shouldUnmute = newVolume > 0 && video.muted
      const newMuted =
        newVolume === 0 ? true : shouldUnmute ? false : video.muted

      if (shouldUnmute) {
        video.muted = false
      }

      dispatch({
        type: 'VOLUME_CHANGE',
        volume: newVolume,
        isMuted: newMuted,
      })
      setPlayerVolume(newVolume)
      setPlayerMuted(newMuted)
    },
    [videoRef, setPlayerVolume, setPlayerMuted],
  )

  const handleSeek = useCallback(
    (time: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = time
        dispatch({ type: 'PLAYBACK_UPDATE', currentTime: time })
      }
    },
    [videoRef],
  )

  // Skip controls using refs for stable timing
  const skipForward = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const newTime = Math.min(
      currentTimeRef.current + SKIP_TIMES[skipTimeIndex],
      durationRef.current,
    )
    video.currentTime = newTime
    dispatch({ type: 'PLAYBACK_UPDATE', currentTime: newTime })
  }, [skipTimeIndex, videoRef])

  const skipBackward = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const newTime = Math.max(
      currentTimeRef.current - SKIP_TIMES[skipTimeIndex],
      0,
    )
    video.currentTime = newTime
    dispatch({ type: 'PLAYBACK_UPDATE', currentTime: newTime })
  }, [skipTimeIndex, videoRef])

  const cycleSkipTimeUp = useCallback(() => {
    dispatch({ type: 'CYCLE_SKIP', direction: 1 })
  }, [])

  const cycleSkipTimeDown = useCallback(() => {
    dispatch({ type: 'CYCLE_SKIP', direction: -1 })
  }, [])

  // Segment timestamp handlers
  const pushStartTimestamp = useCallback(() => {
    onUpdateSegmentTimestamp({
      currentTime: currentTimeRef.current,
      start: true,
    })
  }, [onUpdateSegmentTimestamp])

  const pushEndTimestamp = useCallback(() => {
    onUpdateSegmentTimestamp({
      currentTime: currentTimeRef.current,
      start: false,
    })
  }, [onUpdateSegmentTimestamp])

  // Segment creation
  const handleCreateSegment = useCallback(
    (type: MediaSegmentType) => {
      onCreateSegment({ type, start: currentTimeRef.current })
    },
    [onCreateSegment],
  )

  // Keyboard shortcuts via custom hook
  usePlayerKeyboard({
    togglePlay,
    cycleSkipTimeUp,
    cycleSkipTimeDown,
    skipBackward,
    skipForward,
    pushStartTimestamp,
    pushEndTimestamp,
    toggleMute,
  })

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      container.requestFullscreen()
    }
  }, [])

  // Helper to clear the hide controls timer
  const clearHideControlsTimer = useCallback(() => {
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current)
      hideControlsTimeoutRef.current = null
    }
  }, [])

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement
      setIsFullscreen(isFs)
      // Show controls when entering fullscreen, reset fit mode and clear timer when exiting
      if (isFs) {
        setShowFullscreenControls(true)
        // Clear any existing timer before setting a new one
        clearHideControlsTimer()
        // Start auto-hide timer when entering fullscreen
        hideControlsTimeoutRef.current = setTimeout(() => {
          setShowFullscreenControls(false)
        }, CONTROLS_HIDE_DELAY_MS)
      } else {
        setVideoFitMode('contain')
        // Clear the hide timer to avoid it firing when not in fullscreen
        clearHideControlsTimer()
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [clearHideControlsTimer])

  // Toggle video fit mode (contain <-> cover) and resize subtitles
  const toggleVideoFitMode = useCallback(() => {
    setVideoFitMode((prev) => {
      const next = prev === 'contain' ? 'cover' : 'contain'
      // Cancel any pending resize
      if (resizeRafRef.current !== null) {
        cancelAnimationFrame(resizeRafRef.current)
      }
      // Resize JASSUB after the browser paints the new styles
      // Double rAF ensures styles are applied before resize calculation
      resizeRafRef.current = requestAnimationFrame(() => {
        resizeRafRef.current = requestAnimationFrame(() => {
          resizeRafRef.current = null
          resizeJassub()
        })
      })
      return next
    })
  }, [resizeJassub])

  // Auto-hide controls in fullscreen after inactivity
  const resetHideControlsTimer = useCallback(() => {
    clearHideControlsTimer()
    setShowFullscreenControls(true)
    if (isFullscreen) {
      hideControlsTimeoutRef.current = setTimeout(() => {
        setShowFullscreenControls(false)
      }, CONTROLS_HIDE_DELAY_MS)
    }
  }, [isFullscreen, clearHideControlsTimer])

  // Stable handler to stop event propagation (used in fullscreen OSD overlay)
  const stopPropagation = useCallback(
    (e: React.SyntheticEvent) => e.stopPropagation(),
    [],
  )

  /**
   * Handler for both mouse clicks and touch taps.
   * Uses the same double-click/tap detection logic for consistency.
   *
   * Behavior:
   * - Outside fullscreen: single tap/click toggles play, double tap/click toggles play
   * - In fullscreen: single tap/click shows OSD, double tap/click toggles fit mode
   */
  const handleVideoInteraction = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      // For touch events, prevent the subsequent click event from firing
      if ('changedTouches' in e) {
        e.preventDefault()
      } else {
        // For mouse events, ignore synthetic clicks from touch (e.detail === 0)
        if (e.detail === 0) return
      }

      const now = Date.now()
      const timeSinceLastInteraction = now - lastInteractionTimeRef.current
      lastInteractionTimeRef.current = now

      // Clear any pending single-tap/click action
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current)
        singleTapTimerRef.current = null
      }

      if (timeSinceLastInteraction < DOUBLE_TAP_THRESHOLD_MS) {
        // Double-tap/click detected
        if (isFullscreen) {
          toggleVideoFitMode()
        } else {
          togglePlay()
        }
        // Set timestamp just before threshold window so the next tap
        // won't be detected as another double-tap (prevents triple-tap)
        lastInteractionTimeRef.current = now - (DOUBLE_TAP_THRESHOLD_MS + 1)
      } else {
        // Wait to see if this is a single tap/click or first of a double
        singleTapTimerRef.current = setTimeout(() => {
          singleTapTimerRef.current = null
          if (isFullscreen) {
            // In fullscreen: single tap/click shows controls
            resetHideControlsTimer()
          } else {
            // Outside fullscreen: toggle play
            togglePlay()
          }
        }, DOUBLE_TAP_THRESHOLD_MS)
      }
    },
    [isFullscreen, toggleVideoFitMode, togglePlay, resetHideControlsTimer],
  )

  // Handle mouse movement in fullscreen to show/hide controls
  // Throttled to avoid excessive timer resets during rapid mouse movement
  const handleFullscreenMouseMove = useCallback(() => {
    if (!isFullscreen) return

    const now = Date.now()
    // Only reset timer if controls are hidden OR enough time has passed (throttle)
    if (
      !showFullscreenControls ||
      now - lastMouseMoveRef.current > MOUSE_MOVE_THROTTLE_MS
    ) {
      lastMouseMoveRef.current = now
      resetHideControlsTimer()
    }
  }, [isFullscreen, showFullscreenControls, resetHideControlsTimer])

  // Handle keyboard input in fullscreen to show controls (accessibility)
  const handleFullscreenKeyDown = useCallback(() => {
    if (isFullscreen && !showFullscreenControls) {
      resetHideControlsTimer()
    }
  }, [isFullscreen, showFullscreenControls, resetHideControlsTimer])

  // Handle mouse leave - don't immediately hide, let the timer handle it gracefully
  const handleContainerMouseLeave = useCallback(() => {
    if (isFullscreen && showFullscreenControls) {
      resetHideControlsTimer()
    }
  }, [isFullscreen, showFullscreenControls, resetHideControlsTimer])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      clearHideControlsTimer()
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current)
      }
      if (resizeRafRef.current !== null) {
        cancelAnimationFrame(resizeRafRef.current)
      }
    }
  }, [clearHideControlsTimer])

  // Handler for skip time changes from controls
  const handleSkipTimeChange = useCallback((index: number) => {
    dispatch({ type: 'SKIP_TIME_CHANGE', skipTimeIndex: index })
  }, [])

  // Track selection handlers that also update preferences
  // Requirements: 7.1, 7.3
  const handleAudioTrackSelect = useCallback(
    async (index: number) => {
      await selectAudioTrack(index)
      // Update preference with the selected track's language
      const selectedTrack = trackState.audioTracks.find(
        (track) => track.index === index,
      )
      if (selectedTrack?.language) {
        setPreferredAudioLanguage(selectedTrack.language)
      }
    },
    [selectAudioTrack, trackState.audioTracks, setPreferredAudioLanguage],
  )

  const handleSubtitleTrackSelect = useCallback(
    async (index: number | null) => {
      await selectSubtitleTrack(index)
      // Update preferences based on selection
      if (index === null) {
        // Subtitles turned off
        setSubtitlesEnabled(false)
      } else {
        // Subtitles enabled - update language preference
        setSubtitlesEnabled(true)
        const selectedTrack = trackState.subtitleTracks.find(
          (track) => track.index === index,
        )
        if (selectedTrack?.language) {
          setPreferredSubtitleLanguage(selectedTrack.language)
        }
      }
    },
    [
      selectSubtitleTrack,
      trackState.subtitleTracks,
      setPreferredSubtitleLanguage,
      setSubtitlesEnabled,
    ],
  )

  // Check if tracks are available
  const hasAnyTracks =
    trackState.audioTracks.length > 0 || trackState.subtitleTracks.length > 0

  // Memoized props for PlayerControls to avoid duplication
  const playerControlsProps = useMemo(
    () => ({
      isPlaying,
      isMuted,
      volume,
      skipTimeIndex,
      vibrantColors,
      hasColors,
      iconColor,
      getButtonStyle,
      onTogglePlay: togglePlay,
      onToggleMute: toggleMute,
      onVolumeChange: handleVolumeChange,
      onCreateSegment: handleCreateSegment,
      onSkipTimeChange: handleSkipTimeChange,
      trackState,
      onSelectAudioTrack: handleAudioTrackSelect,
      onSelectSubtitleTrack: handleSubtitleTrackSelect,
      isTrackSelectorDisabled: !hasAnyTracks || isTrackLoading,
      strategy,
      isFullscreen,
      onToggleFullscreen: toggleFullscreen,
      buttonOpacity: isFullscreen ? 0.3 : undefined,
    }),
    [
      isPlaying,
      isMuted,
      volume,
      skipTimeIndex,
      vibrantColors,
      hasColors,
      iconColor,
      getButtonStyle,
      togglePlay,
      toggleMute,
      handleVolumeChange,
      handleCreateSegment,
      handleSkipTimeChange,
      trackState,
      handleAudioTrackSelect,
      handleSubtitleTrackSelect,
      hasAnyTracks,
      isTrackLoading,
      strategy,
      isFullscreen,
      toggleFullscreen,
    ],
  )

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Fullscreen container - wraps everything */}
      <div
        ref={containerRef}
        className={cn(
          'relative',
          isFullscreen && 'fixed inset-0 z-50 bg-black outline-none',
        )}
        onMouseMove={handleFullscreenMouseMove}
        onMouseLeave={handleContainerMouseLeave}
        onKeyDown={handleFullscreenKeyDown}
        tabIndex={isFullscreen ? 0 : -1}
      >
        {/* Video container */}
        <div
          className={cn(
            'relative cursor-pointer',
            isFullscreen ? 'w-full h-full' : 'aspect-video',
          )}
          onClick={handleVideoInteraction}
          onTouchEnd={handleVideoInteraction}
        >
          <video
            ref={videoRef}
            className={cn(
              'w-full h-full',
              isFullscreen
                ? videoFitMode === 'contain'
                  ? 'object-contain'
                  : 'object-cover'
                : 'object-contain',
            )}
            poster={posterUrl}
            crossOrigin="anonymous"
            playsInline
            aria-label={t('player.videoPlayer')}
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={handleDurationChange}
            onProgress={handleProgress}
            onPlay={handlePlay}
            onPause={handlePause}
          />

          {/* Error overlay - strategy-aware */}
          {playerError && !isRecovering && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white">
              <AlertTriangle className="size-12 text-destructive mb-4" />
              <p className="text-lg font-medium mb-2">{playerError.message}</p>
              {strategy === 'direct' && playerError.type === 'media' && (
                <p className="text-sm text-muted-foreground mb-2">
                  {t('player.error.directPlayFailed')}
                </p>
              )}
              {playerError.recoverable && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRetry()
                  }}
                  className="mt-2"
                >
                  <RefreshCw className="size-4 mr-2" />
                  {t('player.retry')}
                </Button>
              )}
            </div>
          )}

          {/* Loading indicator */}
          {isVideoLoading && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/60"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <RefreshCw
                className="size-8 text-white animate-spin"
                aria-hidden="true"
              />
              <span className="sr-only">{t('accessibility.loading')}</span>
            </div>
          )}

          {/* Recovery indicator */}
          {isRecovering && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/60"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <RefreshCw
                className="size-8 text-white animate-spin"
                aria-hidden="true"
              />
              <span className="sr-only">
                {t('player.recovering', 'Recovering playback')}
              </span>
            </div>
          )}
        </div>

        {/* Fullscreen OSD/Controls overlay */}
        {isFullscreen && (
          <div
            className={cn(
              'absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 transition-opacity duration-300',
              showFullscreenControls
                ? 'opacity-100'
                : 'opacity-0 pointer-events-none',
            )}
            aria-hidden={!showFullscreenControls}
            onClick={stopPropagation}
            onTouchEnd={stopPropagation}
          >
            <div className="max-w-[90%] mx-auto">
              {/* Fit mode toggle hint */}
              <div className="flex justify-end mb-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleVideoFitMode}
                  className="text-white/70 hover:text-white hover:bg-white/10 text-xs gap-1.5"
                  aria-label={
                    videoFitMode === 'contain'
                      ? t('player.fillScreen', 'Fill screen')
                      : t('player.fitScreen', 'Fit to screen')
                  }
                >
                  {videoFitMode === 'contain' ? (
                    <>
                      <Expand className="size-4" />
                      {t('player.fill', 'Fill')}
                    </>
                  ) : (
                    <>
                      <Shrink className="size-4" />
                      {t('player.fit', 'Fit')}
                    </>
                  )}
                </Button>
              </div>

              <PlayerScrubber
                currentTime={currentTime}
                duration={duration}
                buffered={buffered}
                onSeek={handleSeek}
                className="mb-4"
              />

              <PlayerControls {...playerControlsProps} />
            </div>
          </div>
        )}
      </div>

      {/* Normal mode controls (outside fullscreen container) */}
      {!isFullscreen && (
        <>
          <PlayerScrubber
            currentTime={currentTime}
            duration={duration}
            buffered={buffered}
            chapters={item.Chapters}
            segments={segments}
            onSeek={handleSeek}
            itemId={item.Id}
            trickplay={item.Trickplay}
          />

          <PlayerControls {...playerControlsProps} />
        </>
      )}
    </div>
  )
}
