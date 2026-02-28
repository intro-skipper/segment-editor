/**
 * PlayerControls - Extracted control buttons from Player component.
 * Reduces Player.tsx complexity by isolating UI controls.
 */

import { useTranslation } from 'react-i18next'
import {
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
import {
  ICON_CLASS,
  applyAlphaToColor,
  getButtonClass,
  getIconStyle,
} from './player-ui-constants'
import type { MediaSegmentType } from '@/types/jellyfin'
import type { VibrantColors } from '@/hooks/use-vibrant-color'
import type { TrackState } from '@/services/video/tracks'
import type { PlaybackStrategy } from '@/services/video/api'
import { SEGMENT_TYPES } from '@/lib/segment-utils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface PlayerControlsProps {
  isPlaying: boolean
  isMuted: boolean
  volume: number
  skipTimeIndex: number
  vibrantColors: VibrantColors | null
  hasColors: boolean
  iconColor: string | undefined
  getButtonStyle: (active?: boolean) => React.CSSProperties | undefined
  onTogglePlay: () => void
  onToggleMute: () => void
  onVolumeChange: (volume: number) => void
  onCreateSegment: (type: MediaSegmentType) => void
  onSkipTimeChange: (index: number) => void
  /** Track state for audio/subtitle selection */
  trackState?: TrackState
  /** Callback when an audio track is selected */
  onSelectAudioTrack?: (index: number) => void
  /** Callback when a subtitle track is selected (null for off) */
  onSelectSubtitleTrack?: (index: number | null) => void
  /** Whether the track selector is disabled */
  isTrackSelectorDisabled?: boolean
  /** Current playback strategy */
  strategy?: PlaybackStrategy
  /** Whether the player is in fullscreen mode */
  isFullscreen?: boolean
  /** Callback to toggle fullscreen */
  onToggleFullscreen?: () => void
  /** Optional opacity for button backgrounds (0-1), useful for fullscreen overlay */
  buttonOpacity?: number
  /** Current subtitle offset in seconds (positive = delay, negative = advance) */
  subtitleOffset?: number
  /** Callback when subtitle offset changes */
  onSubtitleOffsetChange?: (offset: number) => void
  /** Whether subtitles are currently active */
  hasActiveSubtitle?: boolean
  /** Current playback speed index into PLAYBACK_SPEEDS */
  playbackSpeedIndex?: number
  /** Callback when playback speed changes */
  onSpeedChange?: (speedIndex: number) => void
  /** Container element for dropdown portals (needed for fullscreen) */
  portalContainer?: React.RefObject<HTMLElement | null>
}

export function PlayerControls({
  isPlaying,
  isMuted,
  volume,
  skipTimeIndex,
  vibrantColors,
  hasColors,
  iconColor,
  getButtonStyle,
  onTogglePlay,
  onToggleMute,
  onVolumeChange,
  onCreateSegment,
  onSkipTimeChange,
  trackState,
  onSelectAudioTrack,
  onSelectSubtitleTrack,
  isTrackSelectorDisabled,
  strategy,
  isFullscreen,
  onToggleFullscreen,
  buttonOpacity,
  subtitleOffset = 0,
  onSubtitleOffsetChange,
  hasActiveSubtitle = false,
  playbackSpeedIndex,
  onSpeedChange,
  portalContainer,
}: PlayerControlsProps) {
  const { t } = useTranslation()

  // Wrap getButtonStyle to apply background opacity if provided
  // Active buttons (like pause) get higher opacity for better visibility
  const applyButtonStyle = (
    active?: boolean,
  ): React.CSSProperties | undefined => {
    const baseStyle = getButtonStyle(active)
    if (!baseStyle || buttonOpacity === undefined) return baseStyle
    // Only apply alpha when a backgroundColor is present
    if (!baseStyle.backgroundColor) {
      return baseStyle
    }
    // Active state gets higher opacity (closer to 1)
    const effectiveOpacity = active
      ? Math.min(buttonOpacity + 0.3, 1)
      : buttonOpacity
    const newBackgroundColor = applyAlphaToColor(
      baseStyle.backgroundColor,
      effectiveOpacity,
    )
    // applyAlphaToColor may return undefined for unsupported color formats
    // Fall back to base style if alpha cannot be applied
    return newBackgroundColor === undefined
      ? baseStyle
      : {
          ...baseStyle,
          backgroundColor: newBackgroundColor,
        }
  }

  const handleVolumeSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onVolumeChange(parseFloat(e.target.value))
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
          onClick={onTogglePlay}
          aria-label={
            isPlaying
              ? t('accessibility.player.paused', 'Pause video')
              : t('accessibility.playPause', 'Play video')
          }
          aria-pressed={isPlaying}
          style={applyButtonStyle(isPlaying)}
          className={cn(
            getButtonClass(isPlaying, hasColors),
            !isPlaying && 'rounded-full',
          )}
        >
          {isPlaying ? (
            <Pause
              className={ICON_CLASS}
              fill={vibrantColors?.accentText ?? 'currentColor'}
              strokeWidth={0}
              aria-hidden="true"
            />
          ) : (
            <Play
              className={ICON_CLASS}
              fill={iconColor ?? 'currentColor'}
              strokeWidth={0}
              aria-hidden="true"
              style={getIconStyle(iconColor)}
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
                style={applyButtonStyle()}
                className={getButtonClass(false, hasColors)}
              />
            }
          >
            {isMuted || volume === 0 ? (
              <VolumeX
                className={ICON_CLASS}
                strokeWidth={2.5}
                aria-hidden="true"
                style={getIconStyle(iconColor)}
              />
            ) : (
              <Volume2
                className={ICON_CLASS}
                strokeWidth={2.5}
                aria-hidden="true"
                style={getIconStyle(iconColor)}
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
                onClick={onToggleMute}
                className="text-xs"
              >
                {isMuted ? t('player.unmute') : t('player.mute')}
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Track selector for audio and subtitles */}
        {trackState && onSelectAudioTrack && onSelectSubtitleTrack && (
          <TrackSelector
            trackState={trackState}
            onSelectAudio={onSelectAudioTrack}
            onSelectSubtitle={onSelectSubtitleTrack}
            strategy={strategy}
            disabled={isTrackSelectorDisabled}
            getButtonStyle={applyButtonStyle}
            iconColor={iconColor}
            hasColors={hasColors}
            portalContainer={portalContainer}
          />
        )}

        {/* Create segment */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                aria-label={t('editor.newSegment')}
                style={applyButtonStyle()}
                className={getButtonClass(false, hasColors)}
              />
            }
          >
            <Plus
              className={ICON_CLASS}
              strokeWidth={3}
              aria-hidden="true"
              style={getIconStyle(iconColor)}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" container={portalContainer}>
            {SEGMENT_TYPES.map((type) => (
              <DropdownMenuItem
                key={type}
                onClick={() => onCreateSegment(type)}
              >
                {t(`segmentType.${type}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1" />

      {/* Fullscreen button */}
      {onToggleFullscreen && (
        <Button
          variant="outline"
          onClick={onToggleFullscreen}
          aria-label={
            isFullscreen
              ? t('player.exitFullscreen', 'Exit fullscreen')
              : t('player.fullscreen', 'Fullscreen')
          }
          style={applyButtonStyle()}
          className={getButtonClass(false, hasColors)}
        >
          {isFullscreen ? (
            <Minimize
              className={ICON_CLASS}
              strokeWidth={2.5}
              aria-hidden="true"
              style={getIconStyle(iconColor)}
            />
          ) : (
            <Maximize
              className={ICON_CLASS}
              strokeWidth={2.5}
              aria-hidden="true"
              style={getIconStyle(iconColor)}
            />
          )}
        </Button>
      )}

      {/* Settings menu */}
      <PlayerSettingsMenu
        skipTimeIndex={skipTimeIndex}
        hasColors={hasColors}
        iconColor={iconColor}
        applyButtonStyle={applyButtonStyle}
        onSkipTimeChange={onSkipTimeChange}
        subtitleOffset={subtitleOffset}
        onSubtitleOffsetChange={onSubtitleOffsetChange}
        hasActiveSubtitle={hasActiveSubtitle}
        playbackSpeedIndex={playbackSpeedIndex}
        onSpeedChange={onSpeedChange}
        portalContainer={portalContainer}
      />
    </div>
  )
}
