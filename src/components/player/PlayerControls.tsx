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
import { ICON_CLASS, getButtonClass } from './player-ui-constants'
import type { MediaSegmentType } from '@/types/jellyfin'
import type { TrackState } from '@/services/video/tracks'
import type { PlaybackStrategy } from '@/services/video/api'
import { SegmentTypeMenu } from '@/components/segment/SegmentTypeMenu'
import { cn } from '@/lib/utils'
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
    /** Whether selecting another audio track restarts the stream as a transcode */
    audioSwitchRequiresTranscode?: boolean
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
  const isMuted = volumeControls.state === 'muted'
  const isFullscreen = display.mode === 'fullscreen'
  const hasActiveSubtitle = settings.subtitleState === 'active'
  const { level: volume } = volumeControls
  const { portalContainer } = display

  const handleVolumeSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    volumeControls.onChange(parseFloat(e.target.value))
  }

  return (
    <div
      className="flex items-center gap-2 sm:gap-3 flex-wrap"
      role="toolbar"
      aria-label={t('player.controls', 'Video player controls')}
    >
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Play/Pause */}
        <Button
          variant="outline"
          onClick={playback.onToggle}
          aria-label={
            isPlaying
              ? t('accessibility.player.paused', 'Pause video')
              : t('accessibility.playPause', 'Play video')
          }
          aria-pressed={isPlaying}
          className={cn(
            getButtonClass(isPlaying),
            !isPlaying && 'rounded-full',
          )}
        >
          {isPlaying ? (
            <Pause
              className={ICON_CLASS}
              fill="currentColor"
              strokeWidth={0}
              aria-hidden="true"
            />
          ) : (
            <Play
              className={ICON_CLASS}
              fill="currentColor"
              strokeWidth={0}
              aria-hidden="true"
            />
          )}
        </Button>

        {/* Volume */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                aria-label={
                  isMuted || volume === 0
                    ? t('accessibility.player.muted', 'Volume muted')
                    : t('player.volume', 'Volume')
                }
                className={getButtonClass(false)}
              />
            }
          >
            {isMuted || volume === 0 ? (
              <VolumeX
                className={ICON_CLASS}
                strokeWidth={2.5}
                aria-hidden="true"
              />
            ) : (
              <Volume2
                className={ICON_CLASS}
                strokeWidth={2.5}
                aria-hidden="true"
              />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="p-4"
            container={portalContainer}
          >
            <div className="flex flex-col gap-2 items-center">
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeSliderChange}
                aria-label={t('player.volumeSlider')}
                aria-valuemin={0}
                aria-valuemax={1}
                aria-valuenow={isMuted ? 0 : volume}
                aria-valuetext={`${Math.round((isMuted ? 0 : volume) * 100)}%`}
                className="h-24 w-2 appearance-none bg-muted rounded-full cursor-pointer [writing-mode:vertical-lr] [direction:rtl]"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={volumeControls.onToggleMute}
                className="text-xs"
              >
                {isMuted ? t('player.unmute') : t('player.mute')}
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Track selector for audio and subtitles */}
        {trackControls && (
          <TrackSelector
            trackState={trackControls.state}
            onSelectAudio={trackControls.onSelectAudio}
            onSelectSubtitle={trackControls.onSelectSubtitle}
            strategy={trackControls.strategy}
            audioSwitchRequiresTranscode={
              trackControls.audioSwitchRequiresTranscode
            }
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
              variant="outline"
              aria-label={t('editor.newSegment')}
              className={getButtonClass(false)}
            />
          }
        >
          <Plus className={ICON_CLASS} strokeWidth={3} aria-hidden="true" />
        </SegmentTypeMenu>
      </div>

      <div className="flex-1" />

      {/* Minimize button */}
      {display.onMinimize && !isFullscreen && (
        <Button
          variant="outline"
          onClick={display.onMinimize}
          aria-label={t('player.minimize', 'Minimize player')}
          className={getButtonClass(false)}
        >
          <EyeOff className={ICON_CLASS} strokeWidth={2.5} aria-hidden="true" />
        </Button>
      )}

      {/* Fullscreen button */}
      {display.onToggleFullscreen && (
        <Button
          variant="outline"
          onClick={display.onToggleFullscreen}
          aria-label={
            isFullscreen
              ? t('player.exitFullscreen', 'Exit fullscreen')
              : t('player.fullscreen', 'Fullscreen')
          }
          className={getButtonClass(false)}
        >
          {isFullscreen ? (
            <Minimize
              className={ICON_CLASS}
              strokeWidth={2.5}
              aria-hidden="true"
            />
          ) : (
            <Maximize
              className={ICON_CLASS}
              strokeWidth={2.5}
              aria-hidden="true"
            />
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
