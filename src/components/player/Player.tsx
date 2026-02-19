/**
 * Player - Video player with direct play support and HLS fallback.
 */

import {
  memo,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { AlertTriangle, Expand, RefreshCw, Shrink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

import { PlayerScrubber } from './PlayerScrubber'
import { PlayerControls } from './PlayerControls'
import { initialPlayerState, playerReducer } from './player-reducer'
import type {
  BaseItemDto,
  MediaSegmentDto,
  MediaSegmentType,
} from '@/types/jellyfin'
import type { VibrantColors } from '@/hooks/use-vibrant-color'
import type {
  VideoPlayerError,
  VideoPlayerErrorType,
} from '@/hooks/use-video-player'
import type { HlsPlayerError } from '@/hooks/use-hls-player'
import type { CreateSegmentData, TimestampUpdate } from '@/types/segment'
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

const PLAYBACK_UPDATE_INTERVAL_MS = 120

interface PlaybackTimelineState {
  currentTime: number
  duration: number
  buffered: number
}

interface PlaybackTimelineStore {
  getSnapshot: () => PlaybackTimelineState
  subscribe: (listener: () => void) => () => void
  setState: (partial: Partial<PlaybackTimelineState>) => void
}

function createPlaybackTimelineStore(): PlaybackTimelineStore {
  let state: PlaybackTimelineState = {
    currentTime: 0,
    duration: 0,
    buffered: 0,
  }
  const listeners = new Set<() => void>()

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setState: (partial) => {
      const nextState: PlaybackTimelineState = {
        currentTime: partial.currentTime ?? state.currentTime,
        duration: partial.duration ?? state.duration,
        buffered: partial.buffered ?? state.buffered,
      }

      if (
        nextState.currentTime === state.currentTime &&
        nextState.duration === state.duration &&
        nextState.buffered === state.buffered
      ) {
        return
      }

      state = nextState
      listeners.forEach((listener) => {
        listener()
      })
    },
  }
}

interface TimelineScrubberProps {
  timelineStore: PlaybackTimelineStore
  item: BaseItemDto
  segments: Array<MediaSegmentDto> | undefined
  vibrantColors: VibrantColors | null
  onSeek: (time: number) => void
  className?: string
}

const TimelineScrubber = memo(function TimelineScrubberComponent({
  timelineStore,
  item,
  segments,
  vibrantColors,
  onSeek,
  className,
}: TimelineScrubberProps) {
  const { currentTime, duration, buffered } = useSyncExternalStore(
    timelineStore.subscribe,
    timelineStore.getSnapshot,
    timelineStore.getSnapshot,
  )

  return (
    <PlayerScrubber
      currentTime={currentTime}
      duration={duration}
      buffered={buffered}
      chapters={item.Chapters}
      segments={segments}
      vibrantColors={vibrantColors}
      onSeek={onSeek}
      itemId={item.Id}
      trickplay={item.Trickplay}
      className={className}
    />
  )
})

const selectPlayerState = (
  state: ReturnType<typeof useSessionStore.getState>,
) => ({
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

interface FullscreenUiState {
  isFullscreen: boolean
  showFullscreenControls: boolean
  videoFitMode: 'contain' | 'cover'
}

type FullscreenUiAction =
  | { type: 'ENTER_FULLSCREEN' }
  | { type: 'EXIT_FULLSCREEN' }
  | { type: 'SHOW_CONTROLS' }
  | { type: 'HIDE_CONTROLS' }
  | { type: 'TOGGLE_FIT_MODE' }

const initialFullscreenUiState: FullscreenUiState = {
  isFullscreen: false,
  showFullscreenControls: true,
  videoFitMode: 'contain',
}

function fullscreenUiReducer(
  state: FullscreenUiState,
  action: FullscreenUiAction,
): FullscreenUiState {
  switch (action.type) {
    case 'ENTER_FULLSCREEN':
      return {
        ...state,
        isFullscreen: true,
        showFullscreenControls: true,
      }
    case 'EXIT_FULLSCREEN':
      return {
        ...state,
        isFullscreen: false,
        showFullscreenControls: true,
        videoFitMode: 'contain',
      }
    case 'SHOW_CONTROLS':
      return {
        ...state,
        showFullscreenControls: true,
      }
    case 'HIDE_CONTROLS':
      return {
        ...state,
        showFullscreenControls: false,
      }
    case 'TOGGLE_FIT_MODE':
      return {
        ...state,
        videoFitMode: state.videoFitMode === 'contain' ? 'cover' : 'contain',
      }
    default:
      return state
  }
}

interface PlayerProps {
  item: BaseItemDto
  vibrantColors: VibrantColors | null
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
  vibrantColors,
  timestamp,
  segments,
  onCreateSegment,
  onUpdateSegmentTimestamp,
  className,
  getCurrentTimeRef,
}: PlayerProps) {
  return useRenderPlayer({
    item,
    vibrantColors,
    timestamp,
    segments,
    onCreateSegment,
    onUpdateSegmentTimestamp,
    className,
    getCurrentTimeRef,
  })
}

function useRenderPlayer({
  item,
  vibrantColors,
  timestamp,
  segments,
  onCreateSegment,
  onUpdateSegmentTimestamp,
  className,
  getCurrentTimeRef,
}: PlayerProps) {
  const { t } = useTranslation()

  // Use extracted selector with useShallow to prevent unnecessary re-renders
  const { persistedVolume, persistedMuted, setPlayerVolume, setPlayerMuted } =
    useSessionStore(useShallow(selectPlayerState))

  const { getButtonStyle, iconColor, hasColors } =
    useVibrantButtonStyle(vibrantColors)

  const [state, dispatch] = useReducer(playerReducer, {
    ...initialPlayerState,
    volume: persistedVolume,
    isMuted: persistedMuted,
  })
  const {
    isPlaying,
    volume,
    isMuted,
    skipTimeIndex,
    playerError,
    isRecovering,
    subtitleOffset,
  } = state

  // Refs for stable callback references in skip operations
  const currentTimeRef = useRef(0)
  const durationRef = useRef(0)
  const previousStrategyRef = useRef<PlaybackStrategy | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [timelineStore] = useState(createPlaybackTimelineStore)

  const [fullscreenUiState, dispatchFullscreenUi] = useReducer(
    fullscreenUiReducer,
    initialFullscreenUiState,
  )
  const { isFullscreen, showFullscreenControls, videoFitMode } =
    fullscreenUiState

  const hideControlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  // Unified single/double click/tap detection (used for both mouse and touch)
  const lastInteractionTimeRef = useRef(0)
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Throttle mouse move handler (only reset timer every 500ms)
  const lastMouseMoveRef = useRef(0)
  // Track rAF IDs for subtitle resize cleanup
  const resizeRafRef = useRef<number | null>(null)
  const playbackUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const lastPlaybackUpdateAtRef = useRef(0)

  useEffect(() => {
    currentTimeRef.current = 0
    durationRef.current = 0
    timelineStore.setState({
      currentTime: 0,
      duration: 0,
      buffered: 0,
    })
  }, [item.Id, timelineStore])

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
    retry: handleRetry,
    reloadHlsWithUrl,
  } = useVideoPlayer({
    item,
    preferredAudioStreamIndex,
    onError: handleVideoError,
    onStrategyChange: handleStrategyChange,
    t,
  })

  // Track preference setters from app store (combined to avoid 3 separate subscriptions)
  const {
    setPreferredAudioLanguage,
    setPreferredSubtitleLanguage,
    setSubtitlesEnabled,
  } = useAppStore(
    useShallow((s: ReturnType<typeof useAppStore.getState>) => ({
      setPreferredAudioLanguage: s.setPreferredAudioLanguage,
      setPreferredSubtitleLanguage: s.setPreferredSubtitleLanguage,
      setSubtitlesEnabled: s.setSubtitlesEnabled,
    })),
  )

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

  // Handler for subtitle offset changes from UI controls
  const handleSubtitleOffsetChange = useCallback(
    (offset: number) => {
      dispatch({ type: 'SUBTITLE_OFFSET_CHANGE', offset })
      setJassubUserOffset(offset)
    },
    [setJassubUserOffset],
  )

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
  const clearPlaybackUpdateTimer = useCallback(() => {
    if (playbackUpdateTimeoutRef.current !== null) {
      clearTimeout(playbackUpdateTimeoutRef.current)
      playbackUpdateTimeoutRef.current = null
    }
  }, [])

  const publishTimelineTime = useCallback(
    (nextTime: number) => {
      timelineStore.setState({ currentTime: nextTime })
    },
    [timelineStore],
  )

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    const nextTime = video.currentTime
    currentTimeRef.current = nextTime

    const now = performance.now()
    const elapsed = now - lastPlaybackUpdateAtRef.current
    if (
      elapsed >= PLAYBACK_UPDATE_INTERVAL_MS &&
      playbackUpdateTimeoutRef.current === null
    ) {
      lastPlaybackUpdateAtRef.current = now
      publishTimelineTime(nextTime)
      return
    }

    if (playbackUpdateTimeoutRef.current !== null) {
      return
    }

    const remainingDelay = Math.max(0, PLAYBACK_UPDATE_INTERVAL_MS - elapsed)
    playbackUpdateTimeoutRef.current = setTimeout(() => {
      playbackUpdateTimeoutRef.current = null

      const latestTime = videoRef.current?.currentTime
      if (latestTime === undefined) return

      currentTimeRef.current = latestTime
      lastPlaybackUpdateAtRef.current = performance.now()
      publishTimelineTime(latestTime)
    }, remainingDelay)
  }, [videoRef, publishTimelineTime])

  const handleDurationChange = useCallback(() => {
    const duration = videoRef.current?.duration
    if (duration !== undefined) {
      durationRef.current = duration
      timelineStore.setState({ duration })
    }
  }, [videoRef, timelineStore])

  const handleProgress = useCallback(() => {
    const video = videoRef.current
    if (video?.buffered.length) {
      timelineStore.setState({
        buffered: video.buffered.end(video.buffered.length - 1),
      })
    }
  }, [videoRef, timelineStore])

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
        volume: video.volume,
        isMuted: video.muted,
      })
      setPlayerMuted(video.muted)
    }
  }, [videoRef, setPlayerMuted])

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
        clearPlaybackUpdateTimer()
        videoRef.current.currentTime = time
        currentTimeRef.current = time
        lastPlaybackUpdateAtRef.current = performance.now()
        publishTimelineTime(time)
      }
    },
    [videoRef, clearPlaybackUpdateTimer, publishTimelineTime],
  )

  // Skip controls using refs for stable timing
  const skipForward = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    clearPlaybackUpdateTimer()
    const newTime = Math.min(
      currentTimeRef.current + SKIP_TIMES[skipTimeIndex],
      durationRef.current,
    )
    video.currentTime = newTime
    currentTimeRef.current = newTime
    lastPlaybackUpdateAtRef.current = performance.now()
    publishTimelineTime(newTime)
  }, [skipTimeIndex, videoRef, clearPlaybackUpdateTimer, publishTimelineTime])

  const skipBackward = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    clearPlaybackUpdateTimer()
    const newTime = Math.max(
      currentTimeRef.current - SKIP_TIMES[skipTimeIndex],
      0,
    )
    video.currentTime = newTime
    currentTimeRef.current = newTime
    lastPlaybackUpdateAtRef.current = performance.now()
    publishTimelineTime(newTime)
  }, [skipTimeIndex, videoRef, clearPlaybackUpdateTimer, publishTimelineTime])

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

  const handleFullscreenChange = useEffectEvent(() => {
    const isFs = !!document.fullscreenElement

    // Show controls when entering fullscreen, reset fit mode and clear timer when exiting
    if (isFs) {
      dispatchFullscreenUi({ type: 'ENTER_FULLSCREEN' })
      // Clear any existing timer before setting a new one
      clearHideControlsTimer()
      // Start auto-hide timer when entering fullscreen
      hideControlsTimeoutRef.current = setTimeout(() => {
        dispatchFullscreenUi({ type: 'HIDE_CONTROLS' })
      }, CONTROLS_HIDE_DELAY_MS)
    } else {
      dispatchFullscreenUi({ type: 'EXIT_FULLSCREEN' })
      // Clear the hide timer to avoid it firing when not in fullscreen
      clearHideControlsTimer()
    }
  })

  // Listen for fullscreen changes
  useEffect(() => {
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  // Toggle video fit mode (contain <-> cover) and resize subtitles
  const toggleVideoFitMode = useCallback(() => {
    dispatchFullscreenUi({ type: 'TOGGLE_FIT_MODE' })

    // Cancel any pending resize to avoid stale callbacks
    if (resizeRafRef.current !== null) {
      cancelAnimationFrame(resizeRafRef.current)
      resizeRafRef.current = null
    }

    // Schedule resize after browser paints new styles.
    // Double rAF pattern: outer frame waits for style recalc,
    // inner frame ensures layout is complete before measuring.
    // We only track the outer frame ID - cancelling it prevents
    // the inner frame from ever being scheduled.
    resizeRafRef.current = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resizeRafRef.current = null
        resizeJassub()
      })
    })
  }, [resizeJassub])

  // Auto-hide controls in fullscreen after inactivity
  const resetHideControlsTimer = useCallback(() => {
    clearHideControlsTimer()
    dispatchFullscreenUi({ type: 'SHOW_CONTROLS' })
    if (isFullscreen) {
      hideControlsTimeoutRef.current = setTimeout(() => {
        dispatchFullscreenUi({ type: 'HIDE_CONTROLS' })
      }, CONTROLS_HIDE_DELAY_MS)
    }
  }, [isFullscreen, clearHideControlsTimer])

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
      const target = e.target as HTMLElement | null
      if (target?.closest('[data-player-controls-overlay="true"]')) {
        return
      }

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
          // Show controls/OSD after changing fit mode so user gets feedback
          resetHideControlsTimer()
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

  const handleVideoContainerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        togglePlay()
      }
    },
    [togglePlay],
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
      clearPlaybackUpdateTimer()
    }
  }, [clearHideControlsTimer, clearPlaybackUpdateTimer])

  // Handler for skip time changes from controls
  const handleSkipTimeChange = useCallback((index: number) => {
    dispatch({ type: 'SKIP_TIME_CHANGE', skipTimeIndex: index })
  }, [])

  // Track selection handlers that also update preferences
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
      subtitleOffset,
      onSubtitleOffsetChange: handleSubtitleOffsetChange,
      hasActiveSubtitle: activeSubtitleTrack !== null,
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
      subtitleOffset,
      handleSubtitleOffsetChange,
      activeSubtitleTrack,
    ],
  )

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Fullscreen container - wraps everything */}
      <div
        ref={containerRef}
        role="region"
        aria-label={t('player.videoPlayer')}
        className={cn(
          'relative',
          isFullscreen && 'fixed inset-0 z-50 bg-black outline-none',
        )}
        onMouseMove={handleFullscreenMouseMove}
        onMouseLeave={handleContainerMouseLeave}
        tabIndex={isFullscreen ? 0 : -1}
      >
        {/* Video container */}
        <div
          role="button"
          tabIndex={0}
          className={cn(
            'relative',
            isFullscreen
              ? cn(
                  'w-full h-full',
                  showFullscreenControls ? 'cursor-default' : 'cursor-none',
                )
              : 'aspect-video cursor-pointer',
          )}
          onClick={handleVideoInteraction}
          onTouchEnd={handleVideoInteraction}
          onKeyDown={handleVideoContainerKeyDown}
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
            preload="metadata"
            playsInline
            aria-label={t('player.videoPlayer')}
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={handleDurationChange}
            onProgress={handleProgress}
            onPlay={handlePlay}
            onPause={handlePause}
          />

          {/* Error overlay - strategy-aware */}
          {playerError && !isRecovering ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white">
              <AlertTriangle className="size-12 text-destructive mb-4" />
              <p className="text-lg font-medium mb-2">{playerError.message}</p>
              {strategy === 'direct' && playerError.type === 'media' ? (
                <p className="text-sm text-muted-foreground mb-2">
                  {t('player.error.directPlayFailed')}
                </p>
              ) : null}
              {playerError.recoverable ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation()
                    handleRetry()
                  }}
                  className="mt-2"
                >
                  <RefreshCw className="size-4 mr-2" />
                  {t('player.retry')}
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* Loading/Recovery indicator */}
          {isVideoLoading || isRecovering ? (
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/60"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <div className="animate-spin" aria-hidden="true">
                <RefreshCw className="size-8 text-white" />
              </div>
              <span className="sr-only">
                {isRecovering
                  ? t('player.recovering', 'Recovering playback')
                  : t('accessibility.loading')}
              </span>
            </div>
          ) : null}
        </div>

        {/* Fullscreen OSD/Controls overlay */}
        {isFullscreen ? (
          <div
            className={cn(
              'absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 transition-opacity duration-300',
              showFullscreenControls
                ? 'opacity-100'
                : 'opacity-0 pointer-events-none',
            )}
            aria-hidden={!showFullscreenControls}
            // Prevent keyboard focus on hidden controls - inert removes from tab order and accessibility tree
            inert={!showFullscreenControls || undefined}
          >
            <div
              className="max-w-[90%] mx-auto"
              data-player-controls-overlay="true"
            >
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

              <TimelineScrubber
                timelineStore={timelineStore}
                item={item}
                segments={segments}
                vibrantColors={vibrantColors}
                onSeek={handleSeek}
                className="mb-4"
              />

              <PlayerControls {...playerControlsProps} />
            </div>
          </div>
        ) : null}
      </div>

      {/* Normal mode controls (outside fullscreen container) */}
      {!isFullscreen ? (
        <>
          <TimelineScrubber
            timelineStore={timelineStore}
            item={item}
            segments={segments}
            vibrantColors={vibrantColors}
            onSeek={handleSeek}
          />

          <PlayerControls {...playerControlsProps} />
        </>
      ) : null}
    </div>
  )
}
