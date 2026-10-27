import { useTranslation } from 'react-i18next'
import {
  EyeOff,
  Maximize,
  Minimize,
  Pause,
  Play,
  Plus,
  Volume2,
  VolumeX,
} from 'lucide-react'

import { TrackSelector } from './TrackSelector'
import { MediaSourceSelector } from './MediaSourceSelector'
import { PlayerSettingsMenu } from './PlayerSettingsMenu'
import type { PlayerSettingsMenuProps } from './PlayerSettingsMenu'
import { usePlayback, usePlaybackEngine } from './playback-context'
import type { CreateSegmentData } from '@/types/segment'
import type { SelectableMediaSource } from '@/lib/media-source-utils'
import { useAppStore } from '@/stores/app-store'
import { SegmentTypeMenu } from '@/components/segment/SegmentTypeMenu'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface PlayerControlsProps {
  display: {
    mode: 'fullscreen' | 'inline'
    onToggleFullscreen: () => void
    /** Container element for dropdown portals (needed for fullscreen) */
    portalContainer: React.RefObject<HTMLElement | null>
  }
  /** Called with the frame-snapped live position as the start. */
  onCreateSegment: (data: CreateSegmentData) => void
  /** Alternate Jellyfin media versions available for this item. */
  mediaSourceControls?: {
    sources: SelectableMediaSource[]
    value: string
    onSelect: (mediaSourceId: string) => void
  }
  settings: PlayerSettingsMenuProps
}

/** Mute toggle button that opens a vertical volume slider popover. */
function VolumeControl({
  portalContainer,
}: Pick<PlayerControlsProps['display'], 'portalContainer'>) {
  const { t } = useTranslation()
  const engine = usePlaybackEngine()
  const volume = usePlayback((s) => s.volume)
  const isMuted = usePlayback((s) => s.muted)
  const isSilent = isMuted || volume === 0
  const sliderVolume = isMuted ? 0 : volume

  const handleVolumeSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    engine.setVolume(parseFloat(e.target.value))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="player"
            size="icon-xl"
            aria-label={
              isSilent
                ? t('accessibility.player.muted', 'Volume muted')
                : t('player.volume', 'Volume')
            }
          />
        }
      >
        {isSilent ? (
          <VolumeX strokeWidth={2.5} aria-hidden="true" />
        ) : (
          <Volume2 strokeWidth={2.5} aria-hidden="true" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" container={portalContainer}>
        <div className="p-3 flex flex-col gap-2 items-center">
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={sliderVolume}
            onChange={handleVolumeSliderChange}
            aria-label={t('player.volumeSlider')}
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={sliderVolume}
            aria-valuetext={`${Math.round(sliderVolume * 100)}%`}
            className="h-24 w-2 appearance-none bg-muted rounded-full cursor-pointer slider-vertical"
          />
          <Button variant="ghost" size="xs" onClick={engine.toggleMute}>
            {isMuted ? t('player.unmute') : t('player.mute')}
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The transport, track, segment and display controls below the video. */
export function PlayerControls({
  display,
  onCreateSegment,
  mediaSourceControls,
  settings,
}: PlayerControlsProps) {
  const { t } = useTranslation()
  const engine = usePlaybackEngine()
  const isPlaying = usePlayback((s) => !s.paused)
  const setShowVideoPlayer = useAppStore((s) => s.setShowVideoPlayer)
  const isFullscreen = display.mode === 'fullscreen'
  const { portalContainer } = display

  return (
    <div
      className="flex items-center gap-2 sm:gap-3 flex-wrap"
      role="toolbar"
      aria-label={t('player.controls', 'Video player controls')}
    >
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Play/Pause */}
        <Button
          variant="player"
          size="icon-xl"
          onClick={engine.togglePlay}
          aria-label={t('accessibility.playPause', 'Play or pause video')}
          aria-pressed={isPlaying}
        >
          {isPlaying ? (
            <Pause fill="currentColor" strokeWidth={0} aria-hidden="true" />
          ) : (
            <Play fill="currentColor" strokeWidth={0} aria-hidden="true" />
          )}
        </Button>

        {/* Volume */}
        <VolumeControl portalContainer={portalContainer} />

        {/* Alternate video versions */}
        {mediaSourceControls && (
          <MediaSourceSelector
            sources={mediaSourceControls.sources}
            value={mediaSourceControls.value}
            onValueChange={mediaSourceControls.onSelect}
            portalContainer={portalContainer}
          />
        )}

        {/* Track selector for audio and subtitles */}
        <TrackSelector portalContainer={portalContainer} />

        {/* Create segment */}
        <SegmentTypeMenu
          onSelect={(type) =>
            onCreateSegment({ type, start: engine.playhead.getSnappedTime() })
          }
          align="start"
          container={portalContainer}
          render={
            <Button
              variant="player"
              size="icon-xl"
              aria-label={t('editor.newSegment')}
            />
          }
        >
          <Plus strokeWidth={3} aria-hidden="true" />
        </SegmentTypeMenu>
      </div>

      <div className="flex-1" />

      {/* Minimize button */}
      {!isFullscreen && (
        <Button
          variant="player"
          size="icon-xl"
          onClick={() => setShowVideoPlayer(false)}
          aria-label={t('player.minimize', 'Minimize player')}
        >
          <EyeOff strokeWidth={2.5} aria-hidden="true" />
        </Button>
      )}

      {/* Fullscreen button */}
      <Button
        variant="player"
        size="icon-xl"
        onClick={display.onToggleFullscreen}
        aria-label={
          isFullscreen
            ? t('player.exitFullscreen', 'Exit fullscreen')
            : t('player.fullscreen', 'Fullscreen')
        }
      >
        {isFullscreen ? (
          <Minimize strokeWidth={2.5} aria-hidden="true" />
        ) : (
          <Maximize strokeWidth={2.5} aria-hidden="true" />
        )}
      </Button>

      {/* Settings menu */}
      <PlayerSettingsMenu {...settings} portalContainer={portalContainer} />
    </div>
  )
}
