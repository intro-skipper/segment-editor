import {
  useLayoutEffect,
  useReducer,
  useRef,
  useSyncExternalStore,
} from 'react'
import type { ReactEventHandler } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

import { PlayerScrubber } from './PlayerScrubber'
import { PlayerSurface } from './PlayerSurface'
import type { PlayerControlsProps } from './PlayerControls'
import { initialPlayerState, playerReducer } from './player-reducer'
import { buildNativeCaptionTracks } from './caption-tracks'
import { useFullscreenPlayerUi } from './use-fullscreen-player-ui'
import type {
  BaseItemDto,
  MediaSegmentDto,
  MediaSegmentType,
} from '@/types/jellyfin'
import type { CreateSegmentData, TimestampUpdate } from '@/types/segment'
import type { PlaybackStrategy } from '@/services/video/api'
import { getBestImageUrl } from '@/services/video/api'
import type { Playhead } from '@/services/video/playhead'
import { useBlobUrl } from '@/hooks/useBlobUrl'
import { useSessionStore } from '@/stores/session-store'
import { useAppStore } from '@/stores/app-store'
import { useVideoPlayer } from '@/hooks/use-video-player'
import { useTrackManager } from '@/hooks/use-track-manager'
import { useJassubRenderer } from '@/hooks/use-jassub-renderer'
import { usePlayerKeyboard } from '@/hooks/use-player-keyboard'
import { showNotification } from '@/lib/notifications'
import { PLAYER_CONFIG } from '@/lib/constants'
import type { SubtitleTrackInfo, TrackState } from '@/services/video/tracks'
import type { SelectableMediaSource } from '@/lib/media-source-utils'
import {
  extractTracks,
  findPreferredAudioStreamIndex,
} from '@/services/video/tracks'

function findActiveSubtitleTrack({
  activeSubtitleIndex,
  subtitleTracks,
}: TrackState): SubtitleTrackInfo | null {
  if (activeSubtitleIndex === null) return null
  return (
    subtitleTracks.find((track) => track.index === activeSubtitleIndex) ?? null
  )
}

interface TimelineScrubberProps {
  playhead: Playhead
  item: BaseItemDto
  segments: Array<MediaSegmentDto> | undefined
}

function TimelineScrubber({ playhead, item, segments }: TimelineScrubberProps) {
  const { currentTime, duration, buffered } = useSyncExternalStore(
    playhead.subscribe,
    playhead.getTimeline,
    playhead.getTimeline,
  )

  return (
    <PlayerScrubber
      currentTime={currentTime}
      duration={duration}
      buffered={buffered}
      chapters={item.Chapters}
      segments={segments}
      onSeek={playhead.seek}
      itemId={item.Id}
      trickplay={item.Trickplay}
    />
  )
}

function findItemPreferredAudioStreamIndex(
  item: BaseItemDto,
  preferredLanguage: string | null,
): number | undefined {
  const { audioTracks } = extractTracks(item)
  return findPreferredAudioStreamIndex(audioTracks, preferredLanguage)
}

// Read non-reactively: the preference is deliberately consumed only at item
// boundaries (useVideoPlayer resolves getInitialAudioStreamIndex once per
// playback initialization), and handleAudioTrackSelect persists the chosen
// language after every successful switch — a store subscription would
// re-render the whole player tree for a value the render ignores.
const readPreferredAudioLanguage = () =>
  useAppStore.getState().trackPreferences.preferredAudioLanguage

interface PlayerProps {
  item: BaseItemDto
  mediaSourceControls?: {
    sources: SelectableMediaSource[]
    value: string
    onSelect: (mediaSourceId: string) => void
  }
  segments?: Array<MediaSegmentDto>
  onCreateSegment: (data: CreateSegmentData) => void
  onUpdateSegmentTimestamp: (data: TimestampUpdate) => void
  handleRef?: React.RefObject<PlayerHandle | null>
}

/** Imperative access for the editor: read the playhead and seek it. */
export interface PlayerHandle {
  getCurrentTime: () => number
  seek: (time: number) => void
}

export function Player({
  item,
  mediaSourceControls,
  segments,
  onCreateSegment,
  onUpdateSegmentTimestamp,
  handleRef,
}: PlayerProps) {
  return useRenderPlayer({
    item,
    mediaSourceControls,
    segments,
    onCreateSegment,
    onUpdateSegmentTimestamp,
    handleRef,
  })
}

function useRenderPlayer({
  item,
  mediaSourceControls,
  segments,
  onCreateSegment,
  onUpdateSegmentTimestamp,
  handleRef,
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
    subtitleOffset,
    playbackSpeedIndex,
  } = state

  const jellyfinPlaybackSyncEnabled = useAppStore(
    (s) => s.jellyfinPlaybackSyncEnabled,
  )

  const previousStrategyRef = useRef<PlaybackStrategy | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const rawPosterUrl = getBestImageUrl(item, 900, 506) ?? null
  const posterUrl = useBlobUrl(rawPosterUrl)

  const handleStrategyChange = (strategy: PlaybackStrategy) => {
    if (previousStrategyRef.current === 'direct' && strategy === 'hls') {
      showNotification({
        type: 'info',
        message: t('player.notification.switchedToTranscode'),
        duration: 3000,
      })
    }
    previousStrategyRef.current = strategy
  }

  // The exact track this session is currently playing (initial selection or
  // a later native switch). useVideoPlayer's direct-play error fallback reads
  // it through this ref so the live value never becomes an initialization
  // input, yet a forced-HLS fallback still restarts on the track the user is
  // hearing instead of the container default.
  const currentAudioStreamIndexRef = useRef<number | undefined>(undefined)

  const {
    videoRef,
    hlsRef,
    playhead,
    strategy,
    isLoading: isVideoLoading,
    error: playerError,
    isRecovering,
    retry: handleRetry,
    reloadHlsWithUrl,
  } = useVideoPlayer({
    item,
    // Resolved once per playback initialization: the preference decides only
    // the *initial* strategy and audio stream of a session.
    // handleAudioTrackSelect persists the chosen language after every
    // successful switch; applying it mid-session would tear down and reload
    // the source right after an in-place native switch (and, with
    // duplicate-language tracks, re-select the first language match instead
    // of the exact track the user just picked).
    getInitialAudioStreamIndex: () =>
      findItemPreferredAudioStreamIndex(item, readPreferredAudioLanguage()),
    getCurrentAudioStreamIndex: () => currentAudioStreamIndexRef.current,
    jellyfinPlaybackSyncEnabled,
    onStrategyChange: handleStrategyChange,
    t,
  })

  useLayoutEffect(() => {
    playhead.setSegments(segments)
  }, [playhead, segments])
  const skipOffer = useSyncExternalStore(
    playhead.subscribe,
    playhead.getSkipOffer,
    playhead.getSkipOffer,
  )

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
    audioSwitchTranscodeScope,
  } = useTrackManager({
    item,
    strategy,
    videoRef,
    hlsRef,
    t,
    onReloadHls: reloadHlsWithUrl,
  })

  useLayoutEffect(() => {
    currentAudioStreamIndexRef.current = trackState.activeAudioIndex
  }, [trackState.activeAudioIndex])

  const activeSubtitleTrack = findActiveSubtitleTrack(trackState)

  const nativeCaptionTracks = buildNativeCaptionTracks(
    strategy,
    item.Id,
    trackState.subtitleTracks,
  )

  const { setUserOffset: setJassubUserOffset, resize: resizeJassub } =
    useJassubRenderer({
      videoRef,
      strategy,
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
    const video = videoRef.current
    if (video) {
      video.volume = persistedVolume
      video.muted = persistedMuted
    }
  }, [videoRef, persistedVolume, persistedMuted])

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

  useLayoutEffect(() => {
    if (!handleRef) return
    handleRef.current = playhead
    return () => {
      handleRef.current = null
    }
  }, [handleRef, playhead])

  const skipForward = () => {
    playhead.skip(1, skipTimeIndex)
  }

  const skipBackward = () => {
    playhead.skip(-1, skipTimeIndex)
  }

  const stepFrameForward = () => {
    playhead.stepFrame(1)
  }

  const stepFrameBackward = () => {
    playhead.stepFrame(-1)
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
      currentTime: playhead.getSnappedTime(),
      start: true,
    })
  }

  const pushEndTimestamp = () => {
    onUpdateSegmentTimestamp({
      currentTime: playhead.getSnappedTime(),
      start: false,
    })
  }

  const handleCreateSegment = (type: MediaSegmentType) => {
    onCreateSegment({
      type,
      start: playhead.getSnappedTime(),
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
      return
    }

    if (typeof container.requestFullscreen === 'function') {
      container.requestFullscreen().catch(() => {
        // Can fail due to permissions policy, missing user gesture, or
        // element removal. UI state stays in sync via the fullscreenchange listener.
      })
      return
    }

    // iPhone Safari: no element fullscreen API, so calling
    // container.requestFullscreen() would throw synchronously. Fall back to
    // the native video fullscreen player instead.
    const video = videoRef.current
    if (video?.webkitEnterFullscreen) {
      try {
        video.webkitEnterFullscreen()
      } catch {
        // Throws InvalidStateError when playback has not started yet;
        // there is no fullscreen to enter in that case.
      }
    }
  }

  const toggleSubtitles = async () => {
    try {
      if (trackState.activeSubtitleIndex !== null) {
        if (await selectSubtitleTrack(null)) {
          setSubtitlesEnabled(false)
        }
      } else if (trackState.subtitleTracks.length > 0) {
        const firstTrack = trackState.subtitleTracks[0]
        if (await selectSubtitleTrack(firstTrack.index)) {
          setSubtitlesEnabled(true)
          if (firstTrack.language) {
            setPreferredSubtitleLanguage(firstTrack.language)
          }
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

  const handleVideoContainerKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    // Only handle Enter here — Space is handled globally by usePlayerKeyboard.
    if (e.key === 'Enter') {
      e.preventDefault()
      togglePlay()
    }
  }

  const handleSkipTimeChange = (index: number) => {
    dispatch({ type: 'SKIP_TIME_CHANGE', skipTimeIndex: index })
  }

  const handleAudioTrackSelect = async (index: number) => {
    // selectAudioTrack reports failures itself; the catch only shields the
    // persistence below from an unexpected rejection.
    const switched = await selectAudioTrack(index).catch(() => false)
    // Persist only what was actually applied: recording a language the switch
    // could not deliver would desync the persisted preference (and every
    // later item's auto-selection) from what is audible.
    if (!switched) return
    const selectedTrack = trackState.audioTracks.find(
      (track) => track.index === index,
    )
    if (selectedTrack?.language) {
      setPreferredAudioLanguage(selectedTrack.language)
    }
  }

  const handleSubtitleTrackSelect = async (index: number | null) => {
    const switched = await selectSubtitleTrack(index).catch(() => false)
    if (!switched) return
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
    segmentCreation: {
      onCreate: handleCreateSegment,
    },
    mediaSourceControls,
    skipControls: {
      timeIndex: skipTimeIndex,
      onTimeChange: handleSkipTimeChange,
    },
    trackControls: {
      state: trackState,
      availability: !hasAnyTracks || isTrackLoading ? 'disabled' : 'available',
      strategy,
      audioSwitchTranscodeScope,
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
        onPlay: handlePlay,
        onPause: handlePause,
      }}
      playback={{
        error: playerError,
        isRecovering,
        isVideoLoading,
        onRetry: handleRetry,
      }}
      segmentSkip={
        skipOffer
          ? { segment: skipOffer, onSkipSegment: playhead.skipSegment }
          : null
      }
      controlsProps={playerControlsProps}
      timelineScrubber={
        <TimelineScrubber playhead={playhead} item={item} segments={segments} />
      }
    />
  )
}
