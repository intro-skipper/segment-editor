/**
 * Player component.
 * Video player with HLS.js support, playback controls, and segment creation.
 * Requirements: 3.1, 3.2, 3.4, 3.5
 */

import * as React from 'react'
import Hls from 'hls.js'
import {
  AlertTriangle,
  ArrowLeftFromLine,
  ArrowRightFromLine,
  Info,
  Pause,
  Play,
  Plus,
  RefreshCw,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PlayerScrubber } from './PlayerScrubber'
import type { BaseItemDto, MediaSegmentType } from '@/types/jellyfin'
import type { CreateSegmentData, TimestampUpdate } from '@/types/segment'
import { getBestImageUrl, getVideoStreamUrl } from '@/services/video/api'

import { SEGMENT_TYPES } from '@/lib/segment-utils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** Error state for the player */
interface PlayerError {
  type: 'network' | 'media' | 'unknown'
  message: string
  recoverable: boolean
}

/** Player state managed by reducer */
interface PlayerState {
  isPlaying: boolean
  currentTime: number
  duration: number
  buffered: number
  volume: number
  isMuted: boolean
  skipTimeIndex: number
  playerError: PlayerError | null
  isRecovering: boolean
}

/** Player action types */
type PlayerAction =
  | { type: 'SET_PLAYING'; payload: boolean }
  | { type: 'SET_CURRENT_TIME'; payload: number }
  | { type: 'SET_DURATION'; payload: number }
  | { type: 'SET_BUFFERED'; payload: number }
  | { type: 'SET_VOLUME'; payload: number }
  | { type: 'SET_MUTED'; payload: boolean }
  | { type: 'SET_SKIP_TIME_INDEX'; payload: number }
  | { type: 'SET_ERROR'; payload: PlayerError | null }
  | { type: 'SET_RECOVERING'; payload: boolean }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'TOGGLE_MUTE' }
  | { type: 'CYCLE_SKIP_UP' }
  | { type: 'CYCLE_SKIP_DOWN' }

const initialPlayerState: PlayerState = {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  buffered: 0,
  volume: 1,
  isMuted: false,
  skipTimeIndex: 4, // Default to 5s
  playerError: null,
  isRecovering: false,
}

function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.payload }
    case 'SET_CURRENT_TIME':
      return { ...state, currentTime: action.payload }
    case 'SET_DURATION':
      return { ...state, duration: action.payload }
    case 'SET_BUFFERED':
      return { ...state, buffered: action.payload }
    case 'SET_VOLUME':
      return {
        ...state,
        volume: action.payload,
        isMuted: action.payload === 0 ? true : state.isMuted,
      }
    case 'SET_MUTED':
      return { ...state, isMuted: action.payload }
    case 'SET_SKIP_TIME_INDEX':
      return { ...state, skipTimeIndex: action.payload }
    case 'SET_ERROR':
      return { ...state, playerError: action.payload }
    case 'SET_RECOVERING':
      return { ...state, isRecovering: action.payload }
    case 'TOGGLE_PLAY':
      return { ...state, isPlaying: !state.isPlaying }
    case 'TOGGLE_MUTE':
      return { ...state, isMuted: !state.isMuted }
    case 'CYCLE_SKIP_UP':
      return {
        ...state,
        skipTimeIndex: Math.min(state.skipTimeIndex + 1, SKIP_TIMES.length - 1),
      }
    case 'CYCLE_SKIP_DOWN':
      return {
        ...state,
        skipTimeIndex: Math.max(state.skipTimeIndex - 1, 0),
      }
    default:
      return state
  }
}

export interface PlayerProps {
  /** Media item to play */
  item: BaseItemDto
  /** External timestamp to seek to */
  timestamp?: number
  /** Callback when user creates a segment from the player */
  onCreateSegment: (data: CreateSegmentData) => void
  /** Callback when user updates segment timestamp from player */
  onUpdateSegmentTimestamp: (data: TimestampUpdate) => void
  /** Additional class names */
  className?: string
}

/** Available skip time options in seconds */
const SKIP_TIMES = [0.001, 0.01, 0.1, 1, 5] as const

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
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const hlsRef = React.useRef<Hls | null>(null)

  // Use reducer for playback state to minimize re-renders
  const [state, dispatch] = React.useReducer(playerReducer, initialPlayerState)
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

  // Refs for values needed in callbacks without causing re-renders
  const currentTimeRef = React.useRef(currentTime)
  const durationRef = React.useRef(duration)
  React.useEffect(() => {
    currentTimeRef.current = currentTime
  }, [currentTime])
  React.useEffect(() => {
    durationRef.current = duration
  }, [duration])

  // Get poster image URL
  const posterUrl = React.useMemo(() => {
    return getBestImageUrl(item, 900, 506) ?? ''
  }, [item])

  // Get video stream URL
  const videoUrl = React.useMemo(() => {
    if (!item.Id) return ''
    return getVideoStreamUrl({ itemId: item.Id })
  }, [item.Id])

  // Initialize HLS.js
  React.useEffect(() => {
    const video = videoRef.current
    if (!video || !videoUrl) return

    // Clean up previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    // Clear any previous errors
    dispatch({ type: 'SET_ERROR', payload: null })

    if (Hls.isSupported()) {
      const hls = new Hls({
        testBandwidth: false,
      })

      hls.attachMedia(video)

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error('Fatal network error, attempting recovery...')
              dispatch({
                type: 'SET_ERROR',
                payload: {
                  type: 'network',
                  message: t('player.error.network'),
                  recoverable: true,
                },
              })
              dispatch({ type: 'SET_RECOVERING', payload: true })
              hls.startLoad()
              setTimeout(
                () => dispatch({ type: 'SET_RECOVERING', payload: false }),
                2000,
              )
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error('Fatal media error, attempting recovery...')
              dispatch({
                type: 'SET_ERROR',
                payload: {
                  type: 'media',
                  message: t('player.error.media'),
                  recoverable: true,
                },
              })
              dispatch({ type: 'SET_RECOVERING', payload: true })
              hls.recoverMediaError()
              setTimeout(
                () => dispatch({ type: 'SET_RECOVERING', payload: false }),
                2000,
              )
              break
            default:
              console.error('Fatal HLS error:', data)
              dispatch({
                type: 'SET_ERROR',
                payload: {
                  type: 'unknown',
                  message: t('player.error.unknown'),
                  recoverable: false,
                },
              })
              break
          }
        }
      })

      // Clear error on successful manifest load
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        dispatch({ type: 'SET_ERROR', payload: null })
      })

      hls.loadSource(videoUrl)
      hlsRef.current = hls
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      video.src = videoUrl
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [videoUrl, t])

  // Handle external timestamp changes
  React.useEffect(() => {
    if (timestamp !== undefined && videoRef.current) {
      videoRef.current.currentTime = timestamp
    }
  }, [timestamp])

  // Video event handlers - stable references, no dependencies needed
  const handleTimeUpdate = React.useCallback(() => {
    if (videoRef.current) {
      dispatch({
        type: 'SET_CURRENT_TIME',
        payload: videoRef.current.currentTime,
      })
    }
  }, [])

  const handleDurationChange = React.useCallback(() => {
    if (videoRef.current) {
      dispatch({ type: 'SET_DURATION', payload: videoRef.current.duration })
    }
  }, [])

  const handleProgress = React.useCallback(() => {
    if (videoRef.current) {
      const bufferedRanges = videoRef.current.buffered
      if (bufferedRanges.length > 0) {
        dispatch({
          type: 'SET_BUFFERED',
          payload: bufferedRanges.end(bufferedRanges.length - 1),
        })
      }
    }
  }, [])

  const handlePlay = React.useCallback(
    () => dispatch({ type: 'SET_PLAYING', payload: true }),
    [],
  )
  const handlePause = React.useCallback(
    () => dispatch({ type: 'SET_PLAYING', payload: false }),
    [],
  )

  // Playback controls - use refs to avoid dependency on changing values
  const togglePlay = React.useCallback(() => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play()
      } else {
        videoRef.current.pause()
      }
    }
  }, [])

  const toggleMute = React.useCallback(() => {
    if (videoRef.current) {
      const newMuted = !videoRef.current.muted
      videoRef.current.muted = newMuted
      dispatch({ type: 'SET_MUTED', payload: newMuted })
    }
  }, [])

  const handleVolumeChange = React.useCallback((newVolume: number) => {
    if (videoRef.current) {
      videoRef.current.volume = newVolume
      dispatch({ type: 'SET_VOLUME', payload: newVolume })
      if (newVolume > 0 && videoRef.current.muted) {
        videoRef.current.muted = false
        dispatch({ type: 'SET_MUTED', payload: false })
      }
    }
  }, [])

  const handleSeek = React.useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time
      dispatch({ type: 'SET_CURRENT_TIME', payload: time })
    }
  }, [])

  // Skip functions use refs to avoid recreating on every time change
  const skipForward = React.useCallback(() => {
    if (videoRef.current) {
      const skipAmount = SKIP_TIMES[skipTimeIndex]
      const newTime = Math.min(
        currentTimeRef.current + skipAmount,
        durationRef.current,
      )
      videoRef.current.currentTime = newTime
      dispatch({ type: 'SET_CURRENT_TIME', payload: newTime })
    }
  }, [skipTimeIndex])

  const skipBackward = React.useCallback(() => {
    if (videoRef.current) {
      const skipAmount = SKIP_TIMES[skipTimeIndex]
      const newTime = Math.max(currentTimeRef.current - skipAmount, 0)
      videoRef.current.currentTime = newTime
      dispatch({ type: 'SET_CURRENT_TIME', payload: newTime })
    }
  }, [skipTimeIndex])

  const cycleSkipTimeUp = React.useCallback(() => {
    dispatch({ type: 'CYCLE_SKIP_UP' })
  }, [])

  const cycleSkipTimeDown = React.useCallback(() => {
    dispatch({ type: 'CYCLE_SKIP_DOWN' })
  }, [])

  // Segment creation - use ref to avoid dependency on currentTime
  const handleCreateSegment = React.useCallback(
    (type: MediaSegmentType) => {
      onCreateSegment({
        type,
        start: currentTimeRef.current,
      })
    },
    [onCreateSegment],
  )

  // Push timestamp to segment - use refs
  const pushStartTimestamp = React.useCallback(() => {
    onUpdateSegmentTimestamp({
      currentTime: currentTimeRef.current,
      start: true,
    })
  }, [onUpdateSegmentTimestamp])

  const pushEndTimestamp = React.useCallback(() => {
    onUpdateSegmentTimestamp({
      currentTime: currentTimeRef.current,
      start: false,
    })
  }, [onUpdateSegmentTimestamp])

  // Retry loading video after error
  const handleRetry = React.useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null })
    if (hlsRef.current && videoUrl) {
      hlsRef.current.loadSource(videoUrl)
    }
  }, [videoUrl])

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault()
          togglePlay()
          break
        case 'w':
          e.preventDefault()
          cycleSkipTimeUp()
          break
        case 's':
          e.preventDefault()
          cycleSkipTimeDown()
          break
        case 'a':
          e.preventDefault()
          skipBackward()
          break
        case 'd':
          e.preventDefault()
          skipForward()
          break
        case 'e':
          e.preventDefault()
          pushStartTimestamp()
          break
        case 'f':
          e.preventDefault()
          pushEndTimestamp()
          break
        case 'm':
          e.preventDefault()
          toggleMute()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    togglePlay,
    cycleSkipTimeUp,
    cycleSkipTimeDown,
    skipBackward,
    skipForward,
    pushStartTimestamp,
    pushEndTimestamp,
    toggleMute,
  ])

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Video container */}
      <div
        className="relative bg-black rounded-lg overflow-hidden mx-auto"
        style={{ maxWidth: '900px' }}
      >
        <div
          className="relative cursor-pointer"
          style={{ aspectRatio: '16/9' }}
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
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <RefreshCw className="size-8 text-white animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Scrubber */}
      <PlayerScrubber
        currentTime={currentTime}
        duration={duration}
        buffered={buffered}
        onSeek={handleSeek}
      />

      {/* Controls */}
      <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
        {/* Play/Pause */}
        <Button
          variant="outline"
          size="icon"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
        </Button>

        {/* Volume */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                aria-label={t('player.volume')}
              />
            }
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="size-4" />
            ) : (
              <Volume2 className="size-4" />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="p-4">
            <div className="flex flex-col gap-2 items-center">
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                aria-label={t('player.volumeSlider')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((isMuted ? 0 : volume) * 100)}
                aria-valuetext={`${Math.round((isMuted ? 0 : volume) * 100)}%`}
                className="h-24 w-2 appearance-none bg-muted rounded-full cursor-pointer [writing-mode:vertical-lr] [direction:rtl]"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleMute}
                className="text-xs"
              >
                {isMuted ? t('player.unmute') : t('player.mute')}
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Skip time selector */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" className="min-w-[60px]" />}
          >
            <SkipForward className="size-4 mr-1" />
            {SKIP_TIMES[skipTimeIndex]}s
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {SKIP_TIMES.map((time, idx) => (
              <DropdownMenuItem
                key={time}
                onClick={() =>
                  dispatch({ type: 'SET_SKIP_TIME_INDEX', payload: idx })
                }
              >
                {time}s
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Create segment */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                aria-label={t('editor.newSegment')}
              />
            }
          >
            <Plus className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {SEGMENT_TYPES.map((type) => (
              <DropdownMenuItem
                key={type}
                onClick={() => handleCreateSegment(type)}
              >
                {type}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Push start timestamp */}
        <Button
          variant="outline"
          size="icon"
          onClick={pushStartTimestamp}
          aria-label="Set start time"
          title="Set start time (E)"
        >
          <ArrowRightFromLine className="size-4" />
        </Button>

        {/* Push end timestamp */}
        <Button
          variant="outline"
          size="icon"
          onClick={pushEndTimestamp}
          aria-label="Set end time"
          title="Set end time (F)"
        >
          <ArrowLeftFromLine className="size-4" />
        </Button>

        {/* Keyboard shortcuts info */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                aria-label="Keyboard shortcuts"
              />
            }
          >
            <Info className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="p-4 max-w-xs">
            <div className="space-y-2 text-sm">
              <p>
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">
                  Space
                </kbd>{' '}
                Play/Pause
              </p>
              <p>
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">A</kbd>{' '}
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">D</kbd>{' '}
                Skip backward/forward
              </p>
              <p>
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">W</kbd>{' '}
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">S</kbd>{' '}
                Change skip time
              </p>
              <p>
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">E</kbd>{' '}
                Set start timestamp
              </p>
              <p>
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">F</kbd>{' '}
                Set end timestamp
              </p>
              <p>
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">M</kbd>{' '}
                Toggle mute
              </p>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
