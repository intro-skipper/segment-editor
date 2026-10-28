import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'

import { PlayerScrubber } from './PlayerScrubber'
import { PlayerSurface } from './PlayerSurface'
import { PlayerControls } from './PlayerControls'
import type { PlayerControlsProps } from './PlayerControls'
import { usePlaybackEngine, usePlayheadTimeline } from './playback-context'
import { initialPlayerState, playerReducer } from './player-reducer'
import { buildNativeCaptionTracks } from './caption-tracks'
import { useFullscreenPlayerUi } from './use-fullscreen-player-ui'
import type { BaseItemDto } from '@/types/jellyfin'
import type {
  CreateSegmentData,
  Segment,
  TimestampUpdate,
} from '@/types/segment'
import { getBestImageUrl } from '@/services/video/api'
import { useBlobUrl } from '@/hooks/useBlobUrl'
import { usePlayerKeyboard } from '@/hooks/use-player-keyboard'

interface TimelineScrubberProps {
  item: BaseItemDto
  segments: Array<Segment> | undefined
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
  videoRef: React.RefObject<HTMLVideoElement | null>
  mediaSourceControls?: PlayerControlsProps['mediaSourceControls']
  segments?: Array<Segment>
  onCreateSegment: (data: CreateSegmentData) => void
  onUpdateSegmentTimestamp: (data: TimestampUpdate) => void
}

/**
 * The editor's player: connects the provider's engine to its `<video>` while
 * mounted, and adds layout, fullscreen, shortcuts and caption tracks.
 */
export function Player({
  item,
  segments,
  videoRef,
  mediaSourceControls,
  onCreateSegment,
  onUpdateSegmentTimestamp,
}: PlayerProps) {
  const engine = usePlaybackEngine()
  const [{ skipTimeIndex }, dispatch] = useReducer(
    playerReducer,
    initialPlayerState,
  )
  // Player stays mounted across items; another item starts with the defaults.
  const [renderedItemId, setRenderedItemId] = useState(item.Id)
  if (renderedItemId !== item.Id) {
    setRenderedItemId(item.Id)
    dispatch({ type: 'RESET' })
  }
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => engine.connect(), [engine])

  useLayoutEffect(() => {
    engine.playhead.setSegments(segments)
  }, [engine, segments])

  const posterUrl = useBlobUrl(getBestImageUrl(item, 900, 506) ?? null)

  // From the item, not the engine: the <track>s must exist before the engine
  // loads it and shows the selected one.
  const nativeCaptionTracks = buildNativeCaptionTracks(item)

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
  } = useFullscreenPlayerUi({ onTogglePlay: engine.togglePlay })

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
            onToggleFullscreen: toggleFullscreen,
            portalContainer: containerRef,
            ...(isFullscreen
              ? {
                  mode: 'fullscreen',
                  videoFitMode,
                  onToggleVideoFitMode: toggleVideoFitMode,
                }
              : { mode: 'inline' }),
          }}
          onCreateSegment={onCreateSegment}
          mediaSourceControls={mediaSourceControls}
          settings={{
            skipTimeIndex,
            onSkipTimeChange: (index) =>
              dispatch({ type: 'SKIP_TIME_CHANGE', skipTimeIndex: index }),
          }}
        />
      }
    />
  )
}
