/**
 * Player - Video player with HLS.js support and segment controls.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/shallow'

import { PlayerScrubber } from './PlayerScrubber'
import { PlayerControls } from './PlayerControls'
import { initialPlayerState, playerReducer } from './player-reducer'
import type { BaseItemDto, MediaSegmentType } from '@/types/jellyfin'
import type { HlsPlayerError } from '@/hooks/use-hls-player'
import type { CreateSegmentData, TimestampUpdate } from '@/types/segment'
import type { SessionStore } from '@/stores/session-store'
import { getBestImageUrl, getVideoStreamUrl } from '@/services/video/api'
import { useSessionStore } from '@/stores/session-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useHlsPlayer } from '@/hooks/use-hls-player'
import { usePlayerKeyboard } from '@/hooks/use-player-keyboard'
import { useVibrantButtonStyle } from '@/hooks/use-vibrant-button-style'
import { PLAYER_CONFIG } from '@/lib/constants'

const { SKIP_TIMES } = PLAYER_CONFIG

const selectPlayerState = (state: SessionStore) => ({
  vibrantColors: state.vibrantColors,
  persistedVolume: state.playerVolume,
  persistedMuted: state.playerMuted,
  setPlayerVolume: state.setPlayerVolume,
  setPlayerMuted: state.setPlayerMuted,
})

export interface PlayerProps {
  item: BaseItemDto
  timestamp?: number
  onCreateSegment: (data: CreateSegmentData) => void
  onUpdateSegmentTimestamp: (data: TimestampUpdate) => void
  className?: string
}

/**
 * Video player component with HLS.js support.
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
  } = state

  // Refs for stable callback references in skip operations
  const currentTimeRef = useRef(currentTime)
  const durationRef = useRef(duration)

  useLayoutEffect(() => {
    currentTimeRef.current = currentTime
    durationRef.current = duration
  }, [currentTime, duration])

  // Memoized URLs
  const posterUrl = useMemo(() => getBestImageUrl(item, 900, 506) ?? '', [item])
  const videoUrl = useMemo(
    () => (item.Id ? getVideoStreamUrl({ itemId: item.Id }) : ''),
    [item.Id],
  )

  // HLS error handlers - memoized for stability
  const handleHlsError = useCallback((error: HlsPlayerError | null) => {
    dispatch({ type: 'ERROR_STATE', error, isRecovering: false })
  }, [])

  const handleRecoveryStart = useCallback(() => {
    // Set recovering state while preserving current error
    dispatch({ type: 'RECOVERY_START' })
  }, [])

  const handleRecoveryEnd = useCallback(() => {
    dispatch({ type: 'ERROR_STATE', error: null, isRecovering: false })
  }, [])

  // Initialize HLS player via custom hook
  const { videoRef, retry: handleRetry } = useHlsPlayer({
    videoUrl,
    onError: handleHlsError,
    onRecoveryStart: handleRecoveryStart,
    onRecoveryEnd: handleRecoveryEnd,
    t,
  })

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

  // Handler for skip time changes from controls
  const handleSkipTimeChange = useCallback((index: number) => {
    dispatch({ type: 'SKIP_TIME_CHANGE', skipTimeIndex: index })
  }, [])

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Video container */}
      <div className="relative bg-black rounded-lg overflow-hidden mx-auto max-w-[var(--spacing-player-max)]">
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

          {/* Error overlay */}
          {playerError && !isRecovering && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white">
              <AlertTriangle className="size-12 text-destructive mb-4" />
              <p className="text-lg font-medium mb-2">{playerError.message}</p>
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
      />
    </div>
  )
}
