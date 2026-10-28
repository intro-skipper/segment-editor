import type {
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  RefObject,
  TouchEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Loader, RefreshCw, SkipForward } from 'lucide-react'

import type { VideoFitMode } from './use-fullscreen-player-ui'
import type { NativeCaptionTrack } from './caption-tracks'
import {
  usePlayback,
  usePlaybackEngine,
  useSkipOffer,
} from './playback-context'
import type { Segment } from '@/types/segment'
import type { VideoPlayerError } from '@/services/video/playback-error'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type VideoInteractionHandler = (event: MouseEvent | TouchEvent) => void

interface PlayerSurfaceFullscreenState {
  isFullscreen: boolean
  showControls: boolean
  videoFitMode: VideoFitMode
  onMouseMove: () => void
  onMouseLeave: () => void
}

interface PlayerSurfaceVideoState {
  posterUrl: string | null
  captionTracks: Array<NativeCaptionTrack>
  onInteraction: VideoInteractionHandler
}

interface PlayerSurfaceProps {
  containerRef: RefObject<HTMLDivElement | null>
  videoRef: RefObject<HTMLVideoElement | null>
  fullscreen: PlayerSurfaceFullscreenState
  video: PlayerSurfaceVideoState
  controls: ReactNode
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
  const { togglePlay } = usePlaybackEngine()
  const { isFullscreen, showControls, videoFitMode } = fullscreen

  // Space is a global shortcut; Enter plays only from the focused video.
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      togglePlay()
    }
  }

  return (
    <button
      type="button"
      tabIndex={0}
      className={cn(
        'relative block w-full border-0 bg-transparent p-0 text-start text-inherit',
        isFullscreen
          ? cn('w-full h-full', showControls ? 'cursor-default' : 'cursor-none')
          : 'aspect-video cursor-pointer rounded-2xl bg-black',
      )}
      onClick={video.onInteraction}
      onTouchEnd={video.onInteraction}
      onKeyDown={handleKeyDown}
      aria-label={t('player.videoPlayer')}
    >
      {/* The rounded frame must NOT clip the video via an ancestor (overflow-clip/hidden):
          combining an ancestor border-radius clip with the composited JASSUB
          subtitle canvas forces Chromium to mask the hardware video layer, which
          renders the video black on some GPUs once the first subtitle paints.
          Instead the button background and the video element are rounded
          individually, and only the blurred backdrop gets its own clipping box. */}
      {/* Blurred cover backdrop keeps portrait posters looking intentional inside the 16:9 box */}
      {!isFullscreen && video.posterUrl ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-clip rounded-2xl"
        >
          <img
            src={video.posterUrl}
            alt=""
            className="h-full w-full object-cover blur-2xl scale-110 opacity-40"
          />
        </div>
      ) : null}
      {/* Captions are data-dependent: native VTT tracks are rendered when Jellyfin exposes them; ASS/SSA subtitles are rendered by JASSUB. */}
      {/* react-doctor-disable-next-line react-doctor/media-has-caption */}
      <video
        ref={videoRef}
        className={cn(
          isFullscreen
            ? cn(
                'w-full h-full',
                videoFitMode === 'contain' ? 'object-contain' : 'object-cover',
              )
            : 'absolute inset-0 h-full w-full rounded-2xl object-contain',
        )}
        poster={video.posterUrl ?? undefined}
        crossOrigin="anonymous"
        preload="metadata"
        playsInline
        aria-label={t('player.videoPlayer')}
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
  error: VideoPlayerError
  isFullscreen: boolean
  onRetry: () => void
}

function PlayerErrorOverlay({
  error,
  isFullscreen,
  onRetry,
}: PlayerErrorOverlayProps) {
  const { t } = useTranslation()

  return (
    <div
      role="alert"
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-center bg-black/80 px-4 text-center text-white',
        !isFullscreen && 'rounded-2xl',
      )}
    >
      <AlertTriangle
        className="size-12 text-destructive mbe-4"
        aria-hidden="true"
      />
      <p className="text-lg font-medium mbe-2 break-words">{error.message}</p>
      {error.recoverable ? (
        <Button
          size="sm"
          onClick={(event) => {
            event.stopPropagation()
            onRetry()
          }}
          className="mbs-2"
        >
          <RefreshCw />
          {t('player.retry')}
        </Button>
      ) : null}
    </div>
  )
}

interface PlayerLoadingOverlayProps {
  isRecovering: boolean
  isFullscreen: boolean
}

function PlayerLoadingOverlay({
  isRecovering,
  isFullscreen,
}: PlayerLoadingOverlayProps) {
  const { t } = useTranslation()

  return (
    <output
      className={cn(
        'absolute inset-0 flex items-center justify-center bg-black/60',
        !isFullscreen && 'rounded-2xl',
      )}
      aria-live="polite"
      aria-busy="true"
    >
      <Loader className="size-8 text-white" aria-hidden="true" />
      <span className="sr-only">
        {isRecovering
          ? t('player.recovering', 'Recovering playback')
          : t('accessibility.loading')}
      </span>
    </output>
  )
}

interface SegmentSkipOverlayProps {
  segment: Segment
  isFullscreen: boolean
  onSkipSegment: (segment: Segment) => void
}

function SegmentSkipOverlay({
  segment,
  isFullscreen,
  onSkipSegment,
}: SegmentSkipOverlayProps) {
  const { t } = useTranslation()
  const label = t('player.skipSegment', {
    type: t(`segmentType.${segment.type}`),
  })

  return (
    <div className="self-stretch px-4 pbe-4">
      {/* Fullscreen shares the controls' width, so the pill lines up with their right edge. */}
      <div
        className={cn(
          'flex justify-end *:pointer-events-auto',
          isFullscreen && 'max-w-9/10 mx-auto',
        )}
        data-player-controls-overlay="true"
      >
        <Button
          size="lg"
          onClick={() => onSkipSegment(segment)}
          aria-label={label}
        >
          <SkipForward className="size-4" aria-hidden="true" />
          {label}
        </Button>
      </div>
    </div>
  )
}

interface FullscreenControlsOverlayProps {
  showControls: boolean
  controls: ReactNode
  timelineScrubber: ReactNode
}

function FullscreenControlsOverlay({
  showControls,
  controls,
  timelineScrubber,
}: FullscreenControlsOverlayProps) {
  return (
    <div
      className={cn(
        'self-stretch bg-gradient-to-t from-background/90 from-60% to-transparent px-4 pbs-10 pbe-4 transition-opacity duration-300',
        showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0',
      )}
      aria-hidden={!showControls}
      inert={!showControls || undefined}
    >
      <div className="max-w-9/10 mx-auto" data-player-controls-overlay="true">
        <div className="mbe-4">{timelineScrubber}</div>

        {controls}
      </div>
    </div>
  )
}

/** The video with its overlays (error, loading, segment skip), the timeline and the controls, windowed or fullscreen. */
export function PlayerSurface({
  containerRef,
  videoRef,
  fullscreen,
  video,
  controls,
  timelineScrubber,
}: PlayerSurfaceProps) {
  const { t } = useTranslation()
  const engine = usePlaybackEngine()
  const status = usePlayback((s) => s.status)
  const skipOffer = useSkipOffer()
  const isRecovering = status.kind === 'recovering'

  return (
    <div className="flex flex-col gap-4">
      <section
        ref={containerRef}
        aria-label={t('player.videoPlayer')}
        className={cn(
          'relative',
          fullscreen.isFullscreen &&
            'fixed inset-0 z-50 bg-black outline-hidden',
        )}
        onMouseMove={fullscreen.onMouseMove}
        onMouseLeave={fullscreen.onMouseLeave}
      >
        <PlayerVideoButton
          videoRef={videoRef}
          fullscreen={fullscreen}
          video={video}
        />

        {status.kind === 'failed' ? (
          <PlayerErrorOverlay
            error={status.error}
            isFullscreen={fullscreen.isFullscreen}
            onRetry={engine.retry}
          />
        ) : null}

        {status.kind === 'resolving' || isRecovering ? (
          <PlayerLoadingOverlay
            isRecovering={isRecovering}
            isFullscreen={fullscreen.isFullscreen}
          />
        ) : null}

        {/* One bottom-anchored column, so the skip pill stays above the fullscreen controls however tall they wrap. */}
        <div className="absolute inset-x-0 inset-be-0 z-10 flex flex-col items-end pointer-events-none">
          {skipOffer ? (
            <SegmentSkipOverlay
              segment={skipOffer}
              isFullscreen={fullscreen.isFullscreen}
              onSkipSegment={engine.playhead.skipSegment}
            />
          ) : null}

          {fullscreen.isFullscreen ? (
            <FullscreenControlsOverlay
              showControls={fullscreen.showControls}
              controls={controls}
              timelineScrubber={timelineScrubber}
            />
          ) : null}
        </div>
      </section>

      {!fullscreen.isFullscreen ? (
        <>
          {timelineScrubber}

          {controls}
        </>
      ) : null}
    </div>
  )
}
