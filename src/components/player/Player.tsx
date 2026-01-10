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
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/shallow'

import { PlayerScrubber } from './PlayerScrubber'
import { PlayerControls } from './PlayerControls'
import { initialPlayerState, playerReducer } from './player-reducer'
import type { BaseItemDto, MediaSegmentType } from '@/types/jellyfin'
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

const { SKIP_TIMES } = PLAYER_CONFIG

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

export interface PlayerProps {
  item: BaseItemDto
  timestamp?: number
  onCreateSegment: (data: CreateSegmentData) => void
  onUpdateSegmentTimestamp: (data: TimestampUpdate) => void
  className?: string
}

/**
 * Video player component with direct play support and HLS fallback.
 * Provides playback controls, segment creation, and keyboard shortcuts.
 */
export function Player({
  item,
  timestamp,
  onCreateSegment,
  onUpdateSegmentTimestamp,
  className,
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

  useLayoutEffect(() => {
    currentTimeRef.current = currentTime
    durationRef.current = duration
  }, [currentTime, duration])

  // Memoized poster URL - use blob URL to bypass COEP restrictions
  const rawPosterUrl = useMemo(
    () => getBestImageUrl(item, 900, 506) ?? null,
    [item],
  )
  const posterUrl = useBlobUrl(rawPosterUrl)

  // Helper to map VideoPlayerErrorType to HlsPlayerError type
  const mapErrorType = useCallback(
    (type: VideoPlayerErrorType): HlsPlayerError['type'] => {
      switch (type) {
        case 'media_error':
          return 'media'
        case 'network_error':
          return 'network'
        default:
          return 'unknown'
      }
    },
    [],
  )

  // Video player error handler - memoized for stability
  const handleVideoError = useCallback(
    (error: VideoPlayerError | null) => {
      if (error) {
        const hlsError: HlsPlayerError = {
          type: mapErrorType(error.type),
          message: error.message,
          recoverable: error.recoverable,
        }
        dispatch({ type: 'ERROR_STATE', error: hlsError, isRecovering: false })
      } else {
        dispatch({ type: 'ERROR_STATE', error: null, isRecovering: false })
      }
    },
    [mapErrorType],
  )

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
  const { setUserOffset: setJassubUserOffset } = useJassubRenderer({
    videoRef,
    activeTrack: activeSubtitleTrack,
    item,
    transcodingOffsetTicks: 0, // TODO: Get from playback options when HLS transcoding offset is available
    userOffset: subtitleOffset,
    t,
  })

  // Handler for subtitle offset changes (ready for future UI integration)
  const handleSubtitleOffsetChange = useCallback(
    (offset: number) => {
      dispatch({ type: 'SUBTITLE_OFFSET_CHANGE', offset })
      setJassubUserOffset(offset)
    },
    [setJassubUserOffset],
  )
  void handleSubtitleOffsetChange

  // Sync video player error with reducer state
  useEffect(() => {
    if (videoError) {
      dispatch({
        type: 'ERROR_STATE',
        error: {
          type: mapErrorType(videoError.type),
          message: videoError.message,
          recoverable: videoError.recoverable,
        },
        isRecovering: false,
      })
    }
  }, [videoError, mapErrorType])

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

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

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

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Video container */}
      <div
        ref={containerRef}
        className="relative"
      >
        <div
          className="relative cursor-pointer aspect-video"
          onClick={togglePlay}
        >
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
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
      </div>

      <PlayerScrubber
        currentTime={currentTime}
        duration={duration}
        buffered={buffered}
        onSeek={handleSeek}
      />

      <PlayerControls
        isPlaying={isPlaying}
        isMuted={isMuted}
        volume={volume}
        skipTimeIndex={skipTimeIndex}
        vibrantColors={vibrantColors}
        hasColors={hasColors}
        iconColor={iconColor}
        getButtonStyle={getButtonStyle}
        onTogglePlay={togglePlay}
        onToggleMute={toggleMute}
        onVolumeChange={handleVolumeChange}
        onCreateSegment={handleCreateSegment}
        onPushStartTimestamp={pushStartTimestamp}
        onPushEndTimestamp={pushEndTimestamp}
        onSkipTimeChange={handleSkipTimeChange}
        trackState={trackState}
        onSelectAudioTrack={handleAudioTrackSelect}
        onSelectSubtitleTrack={handleSubtitleTrackSelect}
        isTrackSelectorDisabled={!hasAnyTracks || isTrackLoading}
        strategy={strategy}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
      />
    </div>
  )
}
