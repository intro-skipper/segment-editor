import { useLayoutEffect, useReducer, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { PlayerScrubber } from './PlayerScrubber'
import { PlayerSurface } from './PlayerSurface'
import { PlayerControls } from './PlayerControls'
import type { PlayerControlsProps } from './PlayerControls'
import {
  PlaybackProvider,
  usePlayback,
  usePlaybackEngine,
  usePlaybackTracks,
  usePlayheadTimeline,
} from './playback-context'
import { initialPlayerState, playerReducer } from './player-reducer'
import { buildNativeCaptionTracks } from './caption-tracks'
import { useFullscreenPlayerUi } from './use-fullscreen-player-ui'
import type { BaseItemDto, MediaSegmentDto } from '@/types/jellyfin'
import type { CreateSegmentData, TimestampUpdate } from '@/types/segment'
import type { PlaybackStrategy } from '@/services/video/api'
import { getBestImageUrl } from '@/services/video/api'
import type { PlaybackTrackState } from '@/services/video/playback-tracks'
import { extractTracks } from '@/services/video/tracks'
import type { SubtitleTrackInfo } from '@/services/video/tracks'
import { useBlobUrl } from '@/hooks/useBlobUrl'
import { useAppStore } from '@/stores/app-store'
import { useVideoPlayer } from '@/hooks/use-video-player'
import { useJassubRenderer } from '@/hooks/use-jassub-renderer'
import { usePlayerKeyboard } from '@/hooks/use-player-keyboard'
import { showNotification } from '@/lib/notifications'

function findActiveSubtitleTrack({
  activeSubtitleIndex,
  subtitleTracks,
}: PlaybackTrackState): SubtitleTrackInfo | null {
  if (activeSubtitleIndex === null) return null
  return (
    subtitleTracks.find((track) => track.index === activeSubtitleIndex) ?? null
  )
}

interface TimelineScrubberProps {
  item: BaseItemDto
  segments: Array<MediaSegmentDto> | undefined
}

function TimelineScrubber({ item, segments }: TimelineScrubberProps) {
  const { playhead } = usePlaybackEngine()
  const { currentTime, duration, buffered } = usePlayheadTimeline((t) => t)

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

interface PlayerProps {
  item: BaseItemDto
  mediaSourceControls?: PlayerControlsProps['mediaSourceControls']
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

/** Plays `item` for the editor. The playhead goes to `handleRef` while mounted. */
export function Player({ item, segments, handleRef, ...shell }: PlayerProps) {
  const { t } = useTranslation()
  const jellyfinPlaybackSyncEnabled = useAppStore(
    (s) => s.jellyfinPlaybackSyncEnabled,
  )
  const previousStrategyRef = useRef<PlaybackStrategy | null>(null)

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

  const { engine, videoRef } = useVideoPlayer({
    item,
    jellyfinPlaybackSyncEnabled,
    onStrategyChange: handleStrategyChange,
    t,
  })

  useLayoutEffect(() => {
    engine.playhead.setSegments(segments)
  }, [engine, segments])

  useLayoutEffect(() => {
    if (!handleRef) return
    handleRef.current = engine.playhead
    return () => {
      handleRef.current = null
    }
  }, [handleRef, engine])

  return (
    <PlaybackProvider engine={engine}>
      <PlayerShell
        item={item}
        segments={segments}
        videoRef={videoRef}
        {...shell}
      />
    </PlaybackProvider>
  )
}

interface PlayerShellProps extends Omit<PlayerProps, 'handleRef'> {
  videoRef: React.RefObject<HTMLVideoElement | null>
}

/** Layout, fullscreen, shortcuts and subtitles around the provider's engine. */
function PlayerShell({
  item,
  segments,
  videoRef,
  mediaSourceControls,
  onCreateSegment,
  onUpdateSegmentTimestamp,
}: PlayerShellProps) {
  const { t } = useTranslation()
  const engine = usePlaybackEngine()
  const strategy = usePlayback((s) => s.strategy)
  const activeSubtitleTrack = usePlaybackTracks(findActiveSubtitleTrack)
  const [{ skipTimeIndex, subtitleOffset }, dispatch] = useReducer(
    playerReducer,
    initialPlayerState,
  )
  const containerRef = useRef<HTMLDivElement>(null)

  const posterUrl = useBlobUrl(getBestImageUrl(item, 900, 506) ?? null)

  // From the item, not the engine: the <track>s must exist before the engine
  // loads it and shows the selected one.
  const nativeCaptionTracks = buildNativeCaptionTracks(
    item.Id,
    extractTracks(item).subtitleTracks,
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

  const {
    isFullscreen,
    showFullscreenControls,
    videoFitMode,
    toggleVideoFitMode,
    handleVideoInteraction,
    handleFullscreenMouseMove,
    handleContainerMouseLeave,
  } = useFullscreenPlayerUi({
    onTogglePlay: engine.togglePlay,
    onResizeSubtitleRenderer: resizeJassub,
  })

  usePlayerKeyboard({
    skipTimeIndex,
    onCycleSkipTime: (direction) => dispatch({ type: 'CYCLE_SKIP', direction }),
    onUpdateSegmentTimestamp,
    onToggleFullscreen: toggleFullscreen,
  })

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
      }}
      timelineScrubber={<TimelineScrubber item={item} segments={segments} />}
      controls={
        <PlayerControls
          display={{
            mode: isFullscreen ? 'fullscreen' : 'inline',
            onToggleFullscreen: toggleFullscreen,
            portalContainer: containerRef,
          }}
          onCreateSegment={onCreateSegment}
          mediaSourceControls={mediaSourceControls}
          settings={{
            skipTimeIndex,
            onSkipTimeChange: (index) =>
              dispatch({ type: 'SKIP_TIME_CHANGE', skipTimeIndex: index }),
            subtitleOffset,
            onSubtitleOffsetChange: handleSubtitleOffsetChange,
          }}
        />
      }
    />
  )
}
