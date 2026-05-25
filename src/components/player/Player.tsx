import {
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
import {
  AlertTriangle,
  Expand,
  RefreshCw,
  Shrink,
  SkipForward,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

import { PlayerScrubber } from './PlayerScrubber'
import { PlayerControls } from './PlayerControls'
import type { PlayerControlsProps } from './PlayerControls'
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
import { getSubtitleDeliveryUrl } from '@/services/video/track-switching'
import { useJassubRenderer } from '@/hooks/use-jassub-renderer'
import { usePlayerKeyboard } from '@/hooks/use-player-keyboard'
import { useVibrantButtonStyle } from '@/hooks/use-vibrant-button-style'
import { showNotification } from '@/lib/notifications'
import { PLAYER_CONFIG } from '@/lib/constants'
import {
  getFrameStepTargetTime,
  getSkipStepSeconds,
} from '@/lib/player-timing-utils'
import { snapToFrame } from '@/lib/time-utils'
import { extractTracks } from '@/services/video/tracks'

const {
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

interface SegmentTimeRange {
  segment: MediaSegmentDto
  startSeconds: number
  endSeconds: number
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

// NOTE: Segment query layer (`services/segments/api.ts`) maps server ticks to
// UI seconds but preserves DTO field names (`StartTicks`/`EndTicks`).
/** Returns UI-second start time stored in the DTO's StartTicks field. */
const getSegmentStart = (segment: MediaSegmentDto): number | undefined =>
  segment.StartTicks

/** Returns UI-second end time stored in the DTO's EndTicks field. */
const getSegmentEnd = (segment: MediaSegmentDto): number | undefined =>
  segment.EndTicks

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

function TimelineScrubber({
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
}

const selectPlayerState = (
  state: ReturnType<typeof useSessionStore.getState>,
) => ({
  persistedVolume: state.playerVolume,
  persistedMuted: state.playerMuted,
  setPlayerVolume: state.setPlayerVolume,
  setPlayerMuted: state.setPlayerMuted,
})

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
  frameStepSeconds: number
  onCreateSegment: (data: CreateSegmentData) => void
  onUpdateSegmentTimestamp: (data: TimestampUpdate) => void
  className?: string
  getCurrentTimeRef?: React.MutableRefObject<(() => number) | null>
}

export function Player({
  item,
  vibrantColors,
  timestamp,
  segments,
  frameStepSeconds,
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
    frameStepSeconds,
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
  frameStepSeconds: frameStep,
  onCreateSegment,
  onUpdateSegmentTimestamp,
  className,
  getCurrentTimeRef,
}: PlayerProps) {
  const { t } = useTranslation()

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
    playbackSpeedIndex,
  } = state

  const currentTimeRef = useRef(0)
  const durationRef = useRef(0)

  const segmentSkipMode = useAppStore((s) => s.segmentSkipMode)
  const segmentSkipModeRef = useRef(segmentSkipMode)
  segmentSkipModeRef.current = segmentSkipMode

  const jellyfinPlaybackSyncEnabled = useAppStore(
    (s) => s.jellyfinPlaybackSyncEnabled,
  )

  const segmentTimeRanges = useMemo<Array<SegmentTimeRange>>(
    () =>
      (segments ?? [])
        .reduce<Array<SegmentTimeRange>>((acc, segment) => {
          // API model keeps StartTicks/EndTicks field names, but values are
          // normalized to UI seconds in this app path.
          const startSeconds = getSegmentStart(segment)
          const endSeconds = getSegmentEnd(segment)
          if (!isFiniteNumber(startSeconds) || !isFiniteNumber(endSeconds)) {
            return acc
          }
          if (endSeconds > startSeconds) {
            acc.push({ segment, startSeconds, endSeconds })
          }
          return acc
        }, [])
        .sort((a, b) => a.startSeconds - b.startSeconds),
    [segments],
  )
  const segmentTimeRangeById = useMemo<Map<string, SegmentTimeRange>>(
    () =>
      segmentTimeRanges.reduce((map, r) => {
        if (r.segment.Id !== undefined) {
          map.set(r.segment.Id, r)
        }
        return map
      }, new Map<string, SegmentTimeRange>()),
    [segmentTimeRanges],
  )
  const segmentTimeRangesRef = useRef(segmentTimeRanges)
  segmentTimeRangesRef.current = segmentTimeRanges
  const segmentTimeRangeByIdRef = useRef(segmentTimeRangeById)
  segmentTimeRangeByIdRef.current = segmentTimeRangeById

  const [activeSkipSegment, setActiveSkipSegment] =
    useState<MediaSegmentDto | null>(null)
  const prevActiveSegmentIdRef = useRef<string | null | undefined>(undefined)
  const lastAutoSkippedSegmentIdRef = useRef<string | null>(null)

  const snappedCurrentTime = () =>
    snapToFrame(currentTimeRef.current, frameStep)

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

  const lastInteractionTimeRef = useRef(0)
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastMouseMoveRef = useRef(0)
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

  const rawPosterUrl = getBestImageUrl(item, 900, 506) ?? null
  const posterUrl = useBlobUrl(rawPosterUrl)

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

  const handleStrategyChange = useCallback(
    (strategy: PlaybackStrategy) => {
      dispatch({ type: 'ERROR_STATE', error: null, isRecovering: false })

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

  const preferredAudioLanguage = useAppStore(
    (s) => s.trackPreferences.preferredAudioLanguage,
  )

  const preferredAudioStreamIndex = findPreferredAudioStreamIndex(
    item,
    preferredAudioLanguage,
  )

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
    jellyfinPlaybackSyncEnabled,
    onError: handleVideoError,
    onStrategyChange: handleStrategyChange,
    onRecoveryStart: () => {
      dispatch({ type: 'RECOVERY_START' })
    },
    onRecoveryEnd: () => {
      dispatch({ type: 'RECOVERY_END' })
    },
    t,
  })

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

  const activeSubtitleTrack =
    trackState.activeSubtitleIndex === null
      ? null
      : (trackState.subtitleTracks.find(
          (track) => track.index === trackState.activeSubtitleIndex,
        ) ?? null)

  const nativeCaptionTracks = useMemo(() => {
    const itemId = item.Id
    if (strategy !== 'direct' || !itemId) return []

    const tracks: Array<{
      index: number
      language: string | undefined
      label: string
      src: string
    }> = []

    for (const track of trackState.subtitleTracks) {
      const src = getSubtitleDeliveryUrl(itemId, track.index, 'vtt')
      if (src === '') continue

      tracks.push({
        index: track.index,
        language: track.language ?? undefined,
        label: track.displayTitle,
        src,
      })
    }

    return tracks
  }, [item.Id, strategy, trackState.subtitleTracks])
  const primaryCaptionTrack = nativeCaptionTracks.at(0)
  const additionalCaptionTracks = nativeCaptionTracks.slice(1)

  const { setUserOffset: setJassubUserOffset, resize: resizeJassub } =
    useJassubRenderer({
      videoRef,
      activeTrack: activeSubtitleTrack,
      item,
      transcodingOffsetTicks: 0, // TODO: Get from playback options when HLS transcoding offset is available
      userOffset: subtitleOffset,
      t,
    })

  const handleSubtitleOffsetChange = (offset: number) => {
    dispatch({ type: 'SUBTITLE_OFFSET_CHANGE', offset })
    setJassubUserOffset(offset)
  }

  useLayoutEffect(() => {
    if (timestamp !== undefined && videoRef.current) {
      videoRef.current.currentTime = timestamp
    }
  }, [timestamp, videoRef])

  useLayoutEffect(() => {
    const video = videoRef.current
    if (video) {
      video.volume = persistedVolume
      video.muted = persistedMuted
    }
  }, [videoRef, persistedVolume, persistedMuted])

  const clearPlaybackUpdateTimer = () => {
    if (playbackUpdateTimeoutRef.current !== null) {
      clearTimeout(playbackUpdateTimeoutRef.current)
      playbackUpdateTimeoutRef.current = null
    }
  }

  const publishTimelineTime = (nextTime: number) => {
    timelineStore.setState({ currentTime: nextTime })
  }

  /**
   * Updates the active skip segment state based on the current playback time.
   * Handles both 'button' (show overlay) and 'skip' (seek past segment) modes.
   * Uses refs to avoid stale closures and to batch state updates only on changes.
   */
  const checkSegmentSkip = (currentTime: number) => {
    const segmentRanges = segmentTimeRangesRef.current
    const mode = segmentSkipModeRef.current

    if (mode === 'disabled' || segmentRanges.length === 0) {
      if (prevActiveSegmentIdRef.current !== null) {
        prevActiveSegmentIdRef.current = null
        lastAutoSkippedSegmentIdRef.current = null
        setActiveSkipSegment(null)
      }
      return
    }

    // Binary search: find the last range whose startSeconds ≤ currentTime,
    // then verify currentTime falls before its end.
    let lo = 0
    let hi = segmentRanges.length - 1
    let activeRange: SegmentTimeRange | null = null
    while (lo <= hi) {
      const mid = lo + Math.floor((hi - lo) / 2)
      if (segmentRanges[mid].startSeconds <= currentTime) {
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    const candidate = hi >= 0 ? segmentRanges[hi] : null
    if (candidate !== null && currentTime < candidate.endSeconds) {
      activeRange = candidate
    }
    const active = activeRange?.segment ?? null

    const activeId =
      active?.Id ??
      (activeRange
        ? `${activeRange.startSeconds}:${activeRange.endSeconds}:${active?.Type ?? ''}`
        : null)

    if (activeId !== prevActiveSegmentIdRef.current) {
      prevActiveSegmentIdRef.current = activeId
      if (!active) {
        lastAutoSkippedSegmentIdRef.current = null
      }
      if (mode === 'button') {
        setActiveSkipSegment(active)
      }
    }

    if (mode === 'skip' && activeRange && videoRef.current) {
      if (lastAutoSkippedSegmentIdRef.current !== activeId) {
        lastAutoSkippedSegmentIdRef.current = activeId
        const endSecs = activeRange.endSeconds
        handleSeek(endSecs)
      }
    }
  }

  const handleTimeUpdate = () => {
    const video = videoRef.current
    if (!video) return

    const nextTime = video.currentTime
    currentTimeRef.current = nextTime

    checkSegmentSkip(nextTime)

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
  }

  const handleDurationChange = () => {
    const duration = videoRef.current?.duration
    if (duration !== undefined) {
      durationRef.current = duration
      timelineStore.setState({ duration })
    }
  }

  const handleProgress = () => {
    const video = videoRef.current
    if (video?.buffered.length) {
      timelineStore.setState({
        buffered: video.buffered.end(video.buffered.length - 1),
      })
    }
  }

  const handlePlay = () => {
    dispatch({ type: 'PLAY_STATE', isPlaying: true })
  }

  const handlePause = () => {
    dispatch({ type: 'PLAY_STATE', isPlaying: false })
  }

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play().catch(() => {
        // Play can be rejected by autoplay policy or if the element
        // is removed before the promise settles. Failures are
        // already surfaced through the video error event path.
      })
    } else {
      video.pause()
    }
  }

  const toggleMute = () => {
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
  }

  const handleVolumeChange = (newVolume: number) => {
    const video = videoRef.current
    if (!video) return

    video.volume = newVolume

    // Determine mute state: mute if volume is 0, unmute if volume > 0 and was muted
    const shouldUnmute = newVolume > 0 && video.muted
    const newMuted = newVolume === 0 ? true : shouldUnmute ? false : video.muted

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
  }

  const handleSeek = (time: number) => {
    const video = videoRef.current
    if (!video) return

    clearPlaybackUpdateTimer()
    video.currentTime = time
    currentTimeRef.current = time
    lastPlaybackUpdateAtRef.current = performance.now()
    publishTimelineTime(time)
  }

  const skipForward = () => {
    const step = getSkipStepSeconds(skipTimeIndex, frameStep)
    const newTime = Math.min(
      snapToFrame(currentTimeRef.current + step, frameStep),
      durationRef.current,
    )
    handleSeek(newTime)
  }

  const skipBackward = () => {
    const step = getSkipStepSeconds(skipTimeIndex, frameStep)
    const newTime = Math.max(
      snapToFrame(currentTimeRef.current - step, frameStep),
      0,
    )
    handleSeek(newTime)
  }

  const stepFrameForward = () => {
    handleSeek(
      getFrameStepTargetTime(
        currentTimeRef.current,
        1,
        frameStep,
        durationRef.current,
      ),
    )
  }

  const stepFrameBackward = () => {
    handleSeek(
      getFrameStepTargetTime(
        currentTimeRef.current,
        -1,
        frameStep,
        durationRef.current,
      ),
    )
  }

  const cycleSkipTimeUp = () => {
    dispatch({ type: 'CYCLE_SKIP', direction: 1 })
  }

  const cycleSkipTimeDown = () => {
    dispatch({ type: 'CYCLE_SKIP', direction: -1 })
  }

  const increaseSpeed = () => {
    dispatch({ type: 'CYCLE_SPEED', direction: 1 })
  }

  const decreaseSpeed = () => {
    dispatch({ type: 'CYCLE_SPEED', direction: -1 })
  }

  const handleSpeedChange = (speedIndex: number) => {
    dispatch({ type: 'SET_SPEED', speedIndex })
  }

  useLayoutEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.playbackRate = PLAYER_CONFIG.PLAYBACK_SPEEDS[playbackSpeedIndex]
  }, [playbackSpeedIndex, videoRef])

  const pushStartTimestamp = () => {
    onUpdateSegmentTimestamp({
      currentTime: snappedCurrentTime(),
      start: true,
    })
  }

  const pushEndTimestamp = () => {
    onUpdateSegmentTimestamp({
      currentTime: snappedCurrentTime(),
      start: false,
    })
  }

  const handleCreateSegment = (type: MediaSegmentType) => {
    onCreateSegment({
      type,
      start: snappedCurrentTime(),
    })
  }

  const toggleFullscreen = () => {
    const container = containerRef.current
    if (!container) return

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {
        // Can fail if the document is not in fullscreen or element was removed.
        // The fullscreenchange listener will reconcile UI state regardless.
      })
    } else {
      container.requestFullscreen().catch(() => {
        // Can fail due to permissions policy, missing user gesture, or
        // element removal. UI state stays in sync via the fullscreenchange listener.
      })
    }
  }

  const toggleSubtitles = async () => {
    try {
      if (trackState.activeSubtitleIndex !== null) {
        // Subtitles are on — turn them off
        await selectSubtitleTrack(null)
        setSubtitlesEnabled(false)
      } else if (trackState.subtitleTracks.length > 0) {
        // Subtitles are off — turn on the first available track
        const firstTrack = trackState.subtitleTracks[0]
        await selectSubtitleTrack(firstTrack.index)
        setSubtitlesEnabled(true)
        if (firstTrack.language) {
          setPreferredSubtitleLanguage(firstTrack.language)
        }
      }
    } catch {
      // Track switch failures are already surfaced by useTrackManager;
      // catch here to prevent an unhandled rejection from the hotkey path.
    }
  }

  usePlayerKeyboard({
    togglePlay,
    cycleSkipTimeUp,
    cycleSkipTimeDown,
    skipBackward,
    skipForward,
    stepFrameBackward,
    stepFrameForward,
    pushStartTimestamp,
    pushEndTimestamp,
    toggleMute,
    toggleFullscreen,
    toggleSubtitles,
    increaseSpeed,
    decreaseSpeed,
  })

  const clearHideControlsTimer = () => {
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current)
      hideControlsTimeoutRef.current = null
    }
  }

  const clearSingleTapTimer = () => {
    if (singleTapTimerRef.current) {
      clearTimeout(singleTapTimerRef.current)
      singleTapTimerRef.current = null
    }
  }

  const clearResizeFrame = () => {
    if (resizeRafRef.current !== null) {
      cancelAnimationFrame(resizeRafRef.current)
      resizeRafRef.current = null
    }
  }

  const handleFullscreenChange = useEffectEvent(() => {
    const isFs = !!document.fullscreenElement

    if (isFs) {
      dispatchFullscreenUi({ type: 'ENTER_FULLSCREEN' })
      clearHideControlsTimer()
      hideControlsTimeoutRef.current = setTimeout(() => {
        dispatchFullscreenUi({ type: 'HIDE_CONTROLS' })
      }, CONTROLS_HIDE_DELAY_MS)
    } else {
      dispatchFullscreenUi({ type: 'EXIT_FULLSCREEN' })
      clearHideControlsTimer()
    }
  })

  useEffect(() => {
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  const toggleVideoFitMode = () => {
    dispatchFullscreenUi({ type: 'TOGGLE_FIT_MODE' })

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
  }

  const resetHideControlsTimer = () => {
    clearHideControlsTimer()
    dispatchFullscreenUi({ type: 'SHOW_CONTROLS' })
    if (isFullscreen) {
      hideControlsTimeoutRef.current = setTimeout(() => {
        dispatchFullscreenUi({ type: 'HIDE_CONTROLS' })
      }, CONTROLS_HIDE_DELAY_MS)
    }
  }

  /**
   * Handler for both mouse clicks and touch taps.
   * Uses the same double-click/tap detection logic for consistency.
   *
   * Behavior:
   * - Outside fullscreen: single tap/click toggles play, double tap/click toggles play
   * - In fullscreen: single tap/click shows OSD, double tap/click toggles fit mode
   */
  const handleVideoInteraction = (e: React.MouseEvent | React.TouchEvent) => {
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
    clearSingleTapTimer()

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
  }

  const handleVideoContainerKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    // Only handle Enter here — Space is handled globally by usePlayerKeyboard
    if (e.key === 'Enter') {
      e.preventDefault()
      togglePlay()
    }
  }

  const handleFullscreenMouseMove = () => {
    if (!isFullscreen) return

    const now = Date.now()
    if (
      !showFullscreenControls ||
      now - lastMouseMoveRef.current > MOUSE_MOVE_THROTTLE_MS
    ) {
      lastMouseMoveRef.current = now
      resetHideControlsTimer()
    }
  }

  const handleContainerMouseLeave = () => {
    if (isFullscreen && showFullscreenControls) {
      resetHideControlsTimer()
    }
  }

  useEffect(() => {
    return () => {
      clearHideControlsTimer()
      clearSingleTapTimer()
      clearResizeFrame()
      clearPlaybackUpdateTimer()
    }
  }, [])

  useEffect(() => {
    prevActiveSegmentIdRef.current = null
    lastAutoSkippedSegmentIdRef.current = null
    setActiveSkipSegment(null)
  }, [segmentSkipMode])

  const handleSkipSegment = (segment: MediaSegmentDto) => {
    const range =
      segment.Id !== undefined
        ? segmentTimeRangeByIdRef.current.get(segment.Id)
        : undefined
    const fallbackEndSeconds = getSegmentEnd(segment)
    const targetEndSeconds = isFiniteNumber(range?.endSeconds)
      ? range.endSeconds
      : fallbackEndSeconds
    if (!isFiniteNumber(targetEndSeconds)) {
      return
    }
    handleSeek(targetEndSeconds)
    setActiveSkipSegment(null)
    prevActiveSegmentIdRef.current = null
    lastAutoSkippedSegmentIdRef.current = null
  }

  const handleSkipTimeChange = (index: number) => {
    dispatch({ type: 'SKIP_TIME_CHANGE', skipTimeIndex: index })
  }

  const handleAudioTrackSelect = async (index: number) => {
    try {
      await selectAudioTrack(index)
    } catch {
      return
    }
    const selectedTrack = trackState.audioTracks.find(
      (track) => track.index === index,
    )
    if (selectedTrack?.language) {
      setPreferredAudioLanguage(selectedTrack.language)
    }
  }

  const handleSubtitleTrackSelect = async (index: number | null) => {
    try {
      await selectSubtitleTrack(index)
    } catch {
      return
    }
    if (index === null) {
      setSubtitlesEnabled(false)
    } else {
      setSubtitlesEnabled(true)
      const selectedTrack = trackState.subtitleTracks.find(
        (track) => track.index === index,
      )
      if (selectedTrack?.language) {
        setPreferredSubtitleLanguage(selectedTrack.language)
      }
    }
  }

  const hasAnyTracks =
    trackState.audioTracks.length > 0 || trackState.subtitleTracks.length > 0

  const setShowVideoPlayer = useAppStore((s) => s.setShowVideoPlayer)

  const playerControlsProps = {
    playback: {
      state: isPlaying ? 'playing' : 'paused',
      onToggle: togglePlay,
    },
    volumeControls: {
      state: isMuted ? 'muted' : 'audible',
      level: volume,
      onToggleMute: toggleMute,
      onChange: handleVolumeChange,
    },
    appearance: {
      colorMode: hasColors ? 'vibrant' : 'default',
      vibrantColors,
      iconColor,
      getButtonStyle,
      buttonOpacity: isFullscreen ? 0.3 : undefined,
    },
    segmentCreation: {
      onCreate: handleCreateSegment,
    },
    skipControls: {
      timeIndex: skipTimeIndex,
      onTimeChange: handleSkipTimeChange,
    },
    trackControls: {
      state: trackState,
      availability: !hasAnyTracks || isTrackLoading ? 'disabled' : 'available',
      strategy,
      onSelectAudio: handleAudioTrackSelect,
      onSelectSubtitle: handleSubtitleTrackSelect,
    },
    display: {
      mode: isFullscreen ? 'fullscreen' : 'inline',
      onToggleFullscreen: toggleFullscreen,
      onMinimize: () => setShowVideoPlayer(false),
      portalContainer: containerRef,
    },
    settings: {
      subtitleOffset,
      onSubtitleOffsetChange: handleSubtitleOffsetChange,
      subtitleState: activeSubtitleTrack !== null ? 'active' : 'inactive',
      playbackSpeedIndex,
      onSpeedChange: handleSpeedChange,
    },
  } satisfies PlayerControlsProps

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Fullscreen container - wraps everything */}
      <section
        ref={containerRef}
        aria-label={t('player.videoPlayer')}
        className={cn(
          'relative',
          isFullscreen && 'fixed inset-0 z-50 bg-black outline-none',
        )}
        onMouseMove={handleFullscreenMouseMove}
        onMouseLeave={handleContainerMouseLeave}
      >
        {/* Video container */}
        <button
          type="button"
          tabIndex={0}
          className={cn(
            'relative block w-full border-0 bg-transparent p-0 text-left text-inherit',
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
          aria-label={t('player.videoPlayer')}
        >
          {/* Captions are rendered from Jellyfin subtitle metadata when a real VTT source is available. */}
          {/* react-doctor-disable-next-line react-doctor/media-has-caption */}
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
          >
            {primaryCaptionTrack ? (
              <track
                key={primaryCaptionTrack.index}
                kind="captions"
                src={primaryCaptionTrack.src}
                srcLang={primaryCaptionTrack.language}
                label={primaryCaptionTrack.label}
              />
            ) : null}
            {additionalCaptionTracks.map((track) => (
              <track
                key={track.index}
                kind="captions"
                src={track.src}
                srcLang={track.language}
                label={track.label}
              />
            ))}
          </video>
        </button>

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
          <output
            className="absolute inset-0 flex items-center justify-center bg-black/60"
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
          </output>
        ) : null}

        {/* Segment skip button overlay */}
        {segmentSkipMode === 'button' &&
        activeSkipSegment &&
        !playerError &&
        !isVideoLoading ? (
          <div
            className="absolute bottom-4 right-4 z-20"
            data-player-controls-overlay="true"
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSkipSegment(activeSkipSegment)}
              className="gap-1.5 bg-black/60 text-white border-white/30 hover:bg-black/80 hover:text-white backdrop-blur-sm"
              aria-label={t('player.skipSegment', {
                type: t(`segmentType.${activeSkipSegment.Type}`),
              })}
            >
              <SkipForward className="size-4" aria-hidden="true" />
              {t('player.skipSegment', {
                type: t(`segmentType.${activeSkipSegment.Type}`),
              })}
            </Button>
          </div>
        ) : null}

        {isFullscreen ? (
          <div
            className={cn(
              'absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 transition-opacity duration-300',
              showFullscreenControls
                ? 'opacity-100'
                : 'opacity-0 pointer-events-none',
            )}
            aria-hidden={!showFullscreenControls}
            inert={!showFullscreenControls || undefined}
          >
            <div
              className="max-w-[90%] mx-auto"
              data-player-controls-overlay="true"
            >
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
      </section>

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
