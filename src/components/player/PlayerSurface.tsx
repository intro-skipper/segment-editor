import type {
  KeyboardEvent,
  MouseEvent,
  ReactEventHandler,
  ReactNode,
  RefObject,
  TouchEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  Expand,
  RefreshCw,
  Shrink,
  SkipForward,
} from 'lucide-react'

import { PlayerControls } from './PlayerControls'
import type { VideoFitMode } from './use-fullscreen-player-ui'
import type { PlayerControlsProps } from './PlayerControls'
import type { NativeCaptionTrack } from './caption-tracks'
import type { MediaSegmentDto } from '@/types/jellyfin'
import type { HlsPlayerError } from '@/hooks/use-hls-player'
import type { PlaybackStrategy } from '@/services/video/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type VideoInteractionHandler = (event: MouseEvent | TouchEvent) => void

interface PlayerSurfaceFullscreenState {
  isFullscreen: boolean
  showControls: boolean
  videoFitMode: VideoFitMode
  onMouseMove: () => void
  onMouseLeave: () => void
  onToggleVideoFitMode: () => void
}

interface PlayerSurfaceVideoState {
  posterUrl: string | null
  captionTracks: Array<NativeCaptionTrack>
  onInteraction: VideoInteractionHandler
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
  onTimeUpdate: ReactEventHandler<HTMLVideoElement>
  onDurationChange: ReactEventHandler<HTMLVideoElement>
  onProgress: ReactEventHandler<HTMLVideoElement>
  onPlay: ReactEventHandler<HTMLVideoElement>
  onPause: ReactEventHandler<HTMLVideoElement>
}

interface PlayerSurfacePlaybackState {
  error: HlsPlayerError | null
  isRecovering: boolean
  strategy: PlaybackStrategy
  isVideoLoading: boolean
  onRetry: () => void
}

interface PlayerSurfaceSegmentSkipAction {
  segment: MediaSegmentDto
  onSkipSegment: (segment: MediaSegmentDto) => void
}

interface PlayerSurfaceProps {
  className?: string
  containerRef: RefObject<HTMLDivElement | null>
  videoRef: RefObject<HTMLVideoElement | null>
  fullscreen: PlayerSurfaceFullscreenState
  video: PlayerSurfaceVideoState
  playback: PlayerSurfacePlaybackState
  segmentSkip: PlayerSurfaceSegmentSkipAction | null
  controlsProps: PlayerControlsProps
  timelineScrubber: ReactNode
}

interface PlayerVideoButtonProps {
  videoRef: RefObject<HTMLVideoElement | null>
  fullscreen: PlayerSurfaceFullscreenState
  video: PlayerSurfaceVideoState
}

function PlayerVideoButton({
  videoRef,
  fullscreen,
  video,
}: PlayerVideoButtonProps) {
  const { t } = useTranslation()
  const { isFullscreen, showControls, videoFitMode } = fullscreen

  return (
    <button
      type="button"
      tabIndex={0}
      className={cn(
        'relative block w-full border-0 bg-transparent p-0 text-left text-inherit',
        isFullscreen
          ? cn('w-full h-full', showControls ? 'cursor-default' : 'cursor-none')
          : 'aspect-video cursor-pointer',
      )}
      onClick={video.onInteraction}
      onTouchEnd={video.onInteraction}
      onKeyDown={video.onKeyDown}
      aria-label={t('player.videoPlayer')}
    >
      {/* Captions are data-dependent: native VTT tracks are rendered when Jellyfin exposes them; ASS/SSA subtitles are rendered by JASSUB. */}
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
        poster={video.posterUrl ?? undefined}
        crossOrigin="anonymous"
        preload="metadata"
        playsInline
        aria-label={t('player.videoPlayer')}
        onTimeUpdate={video.onTimeUpdate}
        onDurationChange={video.onDurationChange}
        onProgress={video.onProgress}
        onPlay={video.onPlay}
        onPause={video.onPause}
      >
        {video.captionTracks.map((track) => (
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
  )
}

interface PlayerErrorOverlayProps {
  error: HlsPlayerError
  strategy: PlaybackStrategy
  onRetry: () => void
}

function PlayerErrorOverlay({
  error,
  strategy,
  onRetry,
}: PlayerErrorOverlayProps) {
  const { t } = useTranslation()

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white">
      <AlertTriangle className="size-12 text-destructive mb-4" />
      <p className="text-lg font-medium mb-2">{error.message}</p>
      {strategy === 'direct' && error.type === 'media' ? (
        <p className="text-sm text-muted-foreground mb-2">
          {t('player.error.directPlayFailed')}
        </p>
      ) : null}
      {error.recoverable ? (
        <Button
          variant="outline"
          size="sm"
          onClick={(event) => {
            event.stopPropagation()
            onRetry()
          }}
          className="mt-2"
        >
          <RefreshCw className="size-4 mr-2" />
          {t('player.retry')}
        </Button>
      ) : null}
    </div>
  )
}

interface PlayerLoadingOverlayProps {
  isRecovering: boolean
}

function PlayerLoadingOverlay({ isRecovering }: PlayerLoadingOverlayProps) {
  const { t } = useTranslation()

  return (
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
  )
}

interface SegmentSkipOverlayProps {
  segment: MediaSegmentDto
  onSkipSegment: (segment: MediaSegmentDto) => void
}

function SegmentSkipOverlay({
  segment,
  onSkipSegment,
}: SegmentSkipOverlayProps) {
  const { t } = useTranslation()
  const label = t('player.skipSegment', {
    type: t(`segmentType.${segment.Type}`),
  })

  return (
    <div
      className="absolute bottom-4 right-4 z-20"
      data-player-controls-overlay="true"
    >
      <Button
        variant="outline"
        size="sm"
        onClick={() => onSkipSegment(segment)}
        className="gap-1.5 bg-black/60 text-white border-white/30 hover:bg-black/80 hover:text-white backdrop-blur-sm"
        aria-label={label}
      >
        <SkipForward className="size-4" aria-hidden="true" />
        {label}
      </Button>
    </div>
  )
}

interface FullscreenControlsOverlayProps {
  fullscreen: PlayerSurfaceFullscreenState
  controlsProps: PlayerControlsProps
  timelineScrubber: ReactNode
}

function FullscreenControlsOverlay({
  fullscreen,
  controlsProps,
  timelineScrubber,
}: FullscreenControlsOverlayProps) {
  const { t } = useTranslation()
  const { showControls, videoFitMode, onToggleVideoFitMode } = fullscreen

  return (
    <div
      className={cn(
        'absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 transition-opacity duration-300',
        showControls ? 'opacity-100' : 'opacity-0 pointer-events-none',
      )}
      aria-hidden={!showControls}
      inert={!showControls || undefined}
    >
      <div className="max-w-[90%] mx-auto" data-player-controls-overlay="true">
        <div className="flex justify-end mb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleVideoFitMode}
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

        <div className="mb-4">{timelineScrubber}</div>

        <PlayerControls {...controlsProps} />
      </div>
    </div>
  )
}

export function PlayerSurface({
  className,
  containerRef,
  videoRef,
  fullscreen,
  video,
  playback,
  segmentSkip,
  controlsProps,
  timelineScrubber,
}: PlayerSurfaceProps) {
  const { t } = useTranslation()

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <section
        ref={containerRef}
        aria-label={t('player.videoPlayer')}
        className={cn(
          'relative',
          fullscreen.isFullscreen && 'fixed inset-0 z-50 bg-black outline-none',
        )}
        onMouseMove={fullscreen.onMouseMove}
        onMouseLeave={fullscreen.onMouseLeave}
      >
        <PlayerVideoButton
          videoRef={videoRef}
          fullscreen={fullscreen}
          video={video}
        />

        {playback.error && !playback.isRecovering ? (
          <PlayerErrorOverlay
            error={playback.error}
            strategy={playback.strategy}
            onRetry={playback.onRetry}
          />
        ) : null}

        {playback.isVideoLoading || playback.isRecovering ? (
          <PlayerLoadingOverlay isRecovering={playback.isRecovering} />
        ) : null}

        {segmentSkip ? (
          <SegmentSkipOverlay
            segment={segmentSkip.segment}
            onSkipSegment={segmentSkip.onSkipSegment}
          />
        ) : null}

        {fullscreen.isFullscreen ? (
          <FullscreenControlsOverlay
            fullscreen={fullscreen}
            controlsProps={controlsProps}
            timelineScrubber={timelineScrubber}
          />
        ) : null}
      </section>

      {!fullscreen.isFullscreen ? (
        <>
          {timelineScrubber}

          <PlayerControls {...controlsProps} />
        </>
      ) : null}
    </div>
  )
}
