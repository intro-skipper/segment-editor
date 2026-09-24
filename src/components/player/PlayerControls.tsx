/**
 * PlayerControls - Extracted control buttons from Player component.
 * Reduces Player.tsx complexity by isolating UI controls.
 */

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
import { PlayerSettingsMenu } from './PlayerSettingsMenu'
import type { MediaSegmentType } from '@/types/jellyfin'
import type { TrackState } from '@/services/video/tracks'
import type { PlaybackStrategy } from '@/services/video/api'
import type { AudioSwitchTranscodeScope } from '@/hooks/use-track-manager'
import { SegmentTypeMenu } from '@/components/segment/SegmentTypeMenu'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface PlayerControlsProps {
  playback: {
    state: 'playing' | 'paused'
    onToggle: () => void
  }
  volumeControls: {
    state: 'muted' | 'audible'
    level: number
    onToggleMute: () => void
    onChange: (volume: number) => void
  }
  segmentCreation: {
    onCreate: (type: MediaSegmentType) => void
  }
  skipControls: {
    timeIndex: number
    onTimeChange: (index: number) => void
  }
  /** Track controls for audio/subtitle selection */
  trackControls?: {
    state: TrackState
    availability: 'available' | 'disabled'
    strategy?: PlaybackStrategy
    /** Which audio switch targets restart the stream as a transcode */
    audioSwitchTranscodeScope?: AudioSwitchTranscodeScope
    onSelectAudio: (index: number) => void
    onSelectSubtitle: (index: number | null) => void
  }
  display: {
    mode: 'fullscreen' | 'inline'
    onToggleFullscreen?: () => void
    onMinimize?: () => void
    /** Container element for dropdown portals (needed for fullscreen) */
    portalContainer?: React.RefObject<HTMLElement | null>
  }
  settings: {
    /** Current subtitle offset in seconds (positive = delay, negative = advance) */
    subtitleOffset: number
    /** Callback when subtitle offset changes */
    onSubtitleOffsetChange?: (offset: number) => void
    subtitleState: 'active' | 'inactive'
    /** Current playback speed index into PLAYBACK_SPEEDS */
    playbackSpeedIndex?: number
    /** Callback when playback speed changes */
    onSpeedChange?: (speedIndex: number) => void
  }
}

/** Mute toggle button that opens a vertical volume slider popover. */
function VolumeControl({
  volumeControls,
  portalContainer,
}: Pick<PlayerControlsProps, 'volumeControls'> &
  Pick<PlayerControlsProps['display'], 'portalContainer'>) {
  const { t } = useTranslation()
  const isMuted = volumeControls.state === 'muted'
  const { level: volume } = volumeControls
  const isSilent = isMuted || volume === 0
  const sliderVolume = isMuted ? 0 : volume

  const handleVolumeSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    volumeControls.onChange(parseFloat(e.target.value))
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
          <Button
            variant="ghost"
            size="xs"
            onClick={volumeControls.onToggleMute}
          >
            {isMuted ? t('player.unmute') : t('player.mute')}
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PlayerControls({
  playback,
  volumeControls,
  segmentCreation,
  skipControls,
  trackControls,
  display,
  settings,
}: PlayerControlsProps) {
  const { t } = useTranslation()
  const isPlaying = playback.state === 'playing'
  const isFullscreen = display.mode === 'fullscreen'
  const hasActiveSubtitle = settings.subtitleState === 'active'
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
          onClick={playback.onToggle}
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
        <VolumeControl
          volumeControls={volumeControls}
          portalContainer={portalContainer}
        />

        {/* Track selector for audio and subtitles */}
        {trackControls && (
          <TrackSelector
            trackState={trackControls.state}
            onSelectAudio={trackControls.onSelectAudio}
            onSelectSubtitle={trackControls.onSelectSubtitle}
            strategy={trackControls.strategy}
            audioSwitchTranscodeScope={trackControls.audioSwitchTranscodeScope}
            disabled={trackControls.availability === 'disabled'}
            portalContainer={portalContainer}
          />
        )}

        {/* Create segment */}
        <SegmentTypeMenu
          onSelect={segmentCreation.onCreate}
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
      {display.onMinimize && !isFullscreen && (
        <Button
          variant="player"
          size="icon-xl"
          onClick={display.onMinimize}
          aria-label={t('player.minimize', 'Minimize player')}
        >
          <EyeOff strokeWidth={2.5} aria-hidden="true" />
        </Button>
      )}

      {/* Fullscreen button */}
      {display.onToggleFullscreen && (
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
      )}

      {/* Settings menu */}
      <PlayerSettingsMenu
        skipTimeIndex={skipControls.timeIndex}
        onSkipTimeChange={skipControls.onTimeChange}
        subtitleOffset={settings.subtitleOffset}
        onSubtitleOffsetChange={settings.onSubtitleOffsetChange}
        hasActiveSubtitle={hasActiveSubtitle}
        playbackSpeedIndex={settings.playbackSpeedIndex}
        onSpeedChange={settings.onSpeedChange}
        portalContainer={portalContainer}
      />
    </div>
  )
}
