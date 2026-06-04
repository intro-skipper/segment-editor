import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { ReactEventHandler } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

import { PlayerScrubber } from './PlayerScrubber'
import { PlayerSurface } from './PlayerSurface'
import type { PlayerControlsProps } from './PlayerControls'
import { initialPlayerState, playerReducer } from './player-reducer'
import {
  buildSegmentTimeIndex,
  findActiveSegmentRange,
  getSegmentSkipTargetEndSeconds,
  getSegmentTimeRangeId,
} from './segment-skip'
import { buildNativeCaptionTracks } from './caption-tracks'
import { useFullscreenPlayerUi } from './use-fullscreen-player-ui'
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
import { languagesMatch } from '@/lib/language-utils'
import { useVideoPlayer } from '@/hooks/use-video-player'
import { useTrackManager } from '@/hooks/use-track-manager'
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

const PLAYBACK_UPDATE_INTERVAL_MS = 120

function getPlaybackTimestampMs() {
  return performance.now()
}

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

interface ActiveSkipSegmentState {
  segment: MediaSegmentDto
  segmentSkipModeRevision: number
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

function findPreferredAudioStreamIndex(
  item: BaseItemDto,
  preferredLanguage: string | null,
): number | undefined {
  if (!preferredLanguage) return undefined
  const { audioTracks } = extractTracks(item)
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
    useSessionStore(
      useShallow((state) => ({
        persistedVolume: state.playerVolume,
        persistedMuted: state.playerMuted,
        setPlayerVolume: state.setPlayerVolume,
        setPlayerMuted: state.setPlayerMuted,
      })),
    )

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

  const { segmentSkipMode, segmentSkipModeRevision } = useAppStore(
    useShallow((s) => ({
      segmentSkipMode: s.segmentSkipMode,
      segmentSkipModeRevision: s.segmentSkipModeRevision,
    })),
  )
  const segmentSkipModeRef = useRef(segmentSkipMode)
  const currentTimeRef = useRef(0)
  const durationRef = useRef(0)

  const jellyfinPlaybackSyncEnabled = useAppStore(
    (s) => s.jellyfinPlaybackSyncEnabled,
  )

  const segmentTimeIndex = buildSegmentTimeIndex(segments)
  const segmentTimeRangesRef = useRef(segmentTimeIndex.ranges)
  useLayoutEffect(() => {
    segmentTimeRangesRef.current = segmentTimeIndex.ranges
  }, [segmentTimeIndex.ranges])
  const segmentTimeRangeByIdRef = useRef(segmentTimeIndex.rangeById)
  useLayoutEffect(() => {
    segmentTimeRangeByIdRef.current = segmentTimeIndex.rangeById
  }, [segmentTimeIndex.rangeById])

  const [activeSkipSegmentState, setActiveSkipSegmentState] =
    useState<ActiveSkipSegmentState | null>(null)
  const prevActiveSegmentIdRef = useRef<string | null | undefined>(undefined)
  const lastAutoSkippedSegmentIdRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    segmentSkipModeRef.current = segmentSkipMode
    prevActiveSegmentIdRef.current = null
    lastAutoSkippedSegmentIdRef.current = null
  }, [segmentSkipMode, segmentSkipModeRevision])

  const activeSkipSegment =
    activeSkipSegmentState?.segmentSkipModeRevision === segmentSkipModeRevision
      ? activeSkipSegmentState.segment
      : null

  const snappedCurrentTime = () =>
    snapToFrame(currentTimeRef.current, frameStep)

  const previousStrategyRef = useRef<PlaybackStrategy | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [timelineStore] = useState(createPlaybackTimelineStore)

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

  const handleVideoError = (error: VideoPlayerError | null) => {
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
  }

  const handleStrategyChange = (strategy: PlaybackStrategy) => {
    dispatch({ type: 'ERROR_STATE', error: null, isRecovering: false })

    if (previousStrategyRef.current === 'direct' && strategy === 'hls') {
      showNotification({
        type: 'info',
        message: t('player.notification.switchedToTranscode'),
        duration: 3000,
      })
    }
    previousStrategyRef.current = strategy
  }

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
    useShallow((appState) => ({
      setPreferredAudioLanguage: appState.setPreferredAudioLanguage,
      setPreferredSubtitleLanguage: appState.setPreferredSubtitleLanguage,
      setSubtitlesEnabled: appState.setSubtitlesEnabled,
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

  const nativeCaptionTracks = buildNativeCaptionTracks(
    strategy,
    item.Id,
    trackState.subtitleTracks,
  )

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
        setActiveSkipSegmentState(null)
      }
      return
    }

    const activeRange = findActiveSegmentRange(segmentRanges, currentTime)
    const active = activeRange?.segment ?? null
    const activeId = activeRange ? getSegmentTimeRangeId(activeRange) : null
    if (activeId !== prevActiveSegmentIdRef.current) {
      prevActiveSegmentIdRef.current = activeId
      if (!active) {
        lastAutoSkippedSegmentIdRef.current = null
      }
      if (mode === 'button') {
        setActiveSkipSegmentState(
          active
            ? {
                segment: active,
                segmentSkipModeRevision,
              }
            : null,
        )
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

  const handleTimeUpdate: ReactEventHandler<HTMLVideoElement> = (event) => {
    const video = event.currentTarget

    const nextTime = video.currentTime
    currentTimeRef.current = nextTime

    checkSegmentSkip(nextTime)

    const now = getPlaybackTimestampMs()
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
      lastPlaybackUpdateAtRef.current = getPlaybackTimestampMs()
      publishTimelineTime(latestTime)
    }, remainingDelay)
  }

  const handleDurationChange: ReactEventHandler<HTMLVideoElement> = (event) => {
    const duration = event.currentTarget.duration
    durationRef.current = duration
    timelineStore.setState({ duration })
  }

  const handleProgress: ReactEventHandler<HTMLVideoElement> = (event) => {
    const video = event.currentTarget
    if (video.buffered.length) {
      timelineStore.setState({
        buffered: video.buffered.end(video.buffered.length - 1),
      })
    }
  }

  const handlePlay: ReactEventHandler<HTMLVideoElement> = () => {
    dispatch({ type: 'PLAY_STATE', isPlaying: true })
  }

  const handlePause: ReactEventHandler<HTMLVideoElement> = () => {
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
    lastPlaybackUpdateAtRef.current = getPlaybackTimestampMs()
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
        await selectSubtitleTrack(null)
        setSubtitlesEnabled(false)
      } else if (trackState.subtitleTracks.length > 0) {
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

  const {
    isFullscreen,
    showFullscreenControls,
    videoFitMode,
    toggleVideoFitMode,
    handleVideoInteraction,
    handleFullscreenMouseMove,
    handleContainerMouseLeave,
  } = useFullscreenPlayerUi({
    onTogglePlay: togglePlay,
    onResizeSubtitleRenderer: resizeJassub,
  })

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

  useEffect(() => {
    return () => {
      clearPlaybackUpdateTimer()
    }
  }, [])

  const handleVideoContainerKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    // Only handle Enter here — Space is handled globally by usePlayerKeyboard.
    if (e.key === 'Enter') {
      e.preventDefault()
      togglePlay()
    }
  }

  const handleSkipSegment = (segment: MediaSegmentDto) => {
    const range =
      segment.Id !== undefined
        ? segmentTimeRangeByIdRef.current.get(segment.Id)
        : undefined
    const targetEndSeconds = getSegmentSkipTargetEndSeconds(segment, range)
    if (targetEndSeconds === null) return
    handleSeek(targetEndSeconds)
    setActiveSkipSegmentState(null)
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
    <PlayerSurface
      className={className}
      containerRef={containerRef}
      videoRef={videoRef}
      fullscreen={{
        isFullscreen,
        showControls: showFullscreenControls,
        videoFitMode,
        onMouseMove: handleFullscreenMouseMove,
        onMouseLeave: handleContainerMouseLeave,
        onToggleVideoFitMode: toggleVideoFitMode,
      }}
      video={{
        posterUrl,
        captionTracks: nativeCaptionTracks,
        onInteraction: handleVideoInteraction,
        onKeyDown: handleVideoContainerKeyDown,
        onTimeUpdate: handleTimeUpdate,
        onDurationChange: handleDurationChange,
        onProgress: handleProgress,
        onPlay: handlePlay,
        onPause: handlePause,
      }}
      playback={{
        error: playerError,
        isRecovering,
        strategy,
        isVideoLoading,
        onRetry: handleRetry,
      }}
      segmentSkip={
        segmentSkipMode === 'button' && playerError === null && !isVideoLoading
          ? activeSkipSegment
            ? { segment: activeSkipSegment, onSkipSegment: handleSkipSegment }
            : null
          : null
      }
      controlsProps={playerControlsProps}
      timelineScrubber={
        <TimelineScrubber
          timelineStore={timelineStore}
          item={item}
          segments={segments}
          vibrantColors={vibrantColors}
          onSeek={handleSeek}
        />
      }
    />
  )
}
