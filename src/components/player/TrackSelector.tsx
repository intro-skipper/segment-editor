/**
 * TrackSelector - Dropdown component for selecting audio and subtitle tracks.
 *
 * Features:
 * - Audio track selection with language, codec, and channel info
 * - Subtitle track selection with "Off" option
 * - Playback strategy indicator (Direct/HLS)
 * - Keyboard navigation support
 * - Visual indication of active tracks
 *
 * @module components/player/TrackSelector
 */

import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { AudioLines, Captions, Check, Monitor, Zap } from 'lucide-react'

import { ICON_CLASS, getButtonClass, getIconStyle } from './player-ui-constants'
import type { PlaybackStrategy } from '@/services/video/api'
import type { TrackState } from '@/services/video/tracks'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Props for the TrackSelector component.
 *
 * Requirements: 8.1
 */
export interface TrackSelectorProps {
  /** Current state of available and active tracks */
  trackState: TrackState
  /** Callback when an audio track is selected */
  onSelectAudio: (index: number) => void
  /** Callback when a subtitle track is selected (null for off) */
  onSelectSubtitle: (index: number | null) => void
  /** Current playback strategy (direct or hls) */
  strategy?: PlaybackStrategy
  /** Whether the selector is disabled */
  disabled?: boolean
  /** Button styling function from vibrant colors */
  getButtonStyle?: (active?: boolean) => React.CSSProperties | undefined
  /** Icon color from vibrant colors */
  iconColor?: string
  /** Whether vibrant colors are available */
  hasColors?: boolean
  /** Custom class name for the trigger button */
  className?: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * TrackSelector component for selecting audio and subtitle tracks.
 *
 * Displays a dropdown menu with two sections:
 * - Audio tracks with language, codec, and channel information
 * - Subtitle tracks with "Off" option and format information
 *
 * Requirements: 8.1, 8.2, 8.4
 */
export const TrackSelector = memo(function TrackSelector({
  trackState,
  onSelectAudio,
  onSelectSubtitle,
  strategy,
  disabled = false,
  getButtonStyle,
  iconColor,
  hasColors = false,
  className,
}: TrackSelectorProps) {
  const { t } = useTranslation()

  const { audioTracks, subtitleTracks, activeAudioIndex, activeSubtitleIndex } =
    trackState

  // Check if there are any tracks to display
  const hasAudioTracks = audioTracks.length > 0
  const hasSubtitleTracks = subtitleTracks.length > 0
  const hasTracks = hasAudioTracks || hasSubtitleTracks

  // Strategy indicator info
  const isDirect = strategy === 'direct'
  const StrategyIcon = isDirect ? Zap : Monitor

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            aria-label={t(
              'player.tracks.selector',
              'Audio and subtitle tracks',
            )}
            disabled={disabled || !hasTracks}
            style={getButtonStyle?.()}
            className={cn(getButtonClass(false, hasColors), className)}
          />
        }
      >
        <AudioLines
          className={ICON_CLASS}
          strokeWidth={2.5}
          aria-hidden="true"
          style={getIconStyle(iconColor)}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="min-w-[240px] max-h-[400px] overflow-y-auto"
      >
        {/* Playback Strategy Indicator */}
        {strategy && (
          <>
            <div className="px-3 py-2">
              <div
                className={cn(
                  'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium',
                  isDirect
                    ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                    : 'bg-blue-500/10 text-blue-600 border border-blue-500/20',
                )}
                role="status"
                aria-label={
                  isDirect
                    ? t(
                        'player.strategy.direct',
                        'Direct Play - Original quality, no transcoding',
                      )
                    : t(
                        'player.strategy.hls',
                        'HLS Streaming - Transcoded for compatibility',
                      )
                }
              >
                <StrategyIcon className="size-3" aria-hidden="true" />
                <span>
                  {isDirect
                    ? t('player.strategy.directLabel', 'Direct Play')
                    : t('player.strategy.hlsLabel', 'HLS Transcode')}
                </span>
              </div>
            </div>
            {hasTracks && <DropdownMenuSeparator />}
          </>
        )}

        {/* Audio Tracks Section */}
        {hasAudioTracks && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-2">
              <AudioLines className="size-4" aria-hidden="true" />
              {t('player.tracks.audio', 'Audio')}
            </DropdownMenuLabel>

            {audioTracks.map((track) => {
              const isActive = track.index === activeAudioIndex

              return (
                <DropdownMenuItem
                  key={`audio-${track.index}`}
                  onClick={() => onSelectAudio(track.index)}
                  className={cn(
                    'flex items-center justify-between gap-2',
                    isActive && 'bg-accent',
                  )}
                  aria-selected={isActive}
                >
                  <span className="truncate">{track.displayTitle}</span>
                  {isActive && (
                    <Check
                      className="size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                  )}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>
        )}

        {/* Separator between sections */}
        {hasAudioTracks && hasSubtitleTracks && <DropdownMenuSeparator />}

        {/* Subtitle Tracks Section */}
        {hasSubtitleTracks && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-2">
              <Captions className="size-4" aria-hidden="true" />
              {t('player.tracks.subtitle', 'Subtitles')}
            </DropdownMenuLabel>

            {/* Off option */}
            <DropdownMenuItem
              onClick={() => onSelectSubtitle(null)}
              className={cn(
                'flex items-center justify-between gap-2',
                activeSubtitleIndex === null && 'bg-accent',
              )}
              aria-selected={activeSubtitleIndex === null}
            >
              <span>{t('player.tracks.off', 'Off')}</span>
              {activeSubtitleIndex === null && (
                <Check
                  className="size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
              )}
            </DropdownMenuItem>

            {/* Subtitle tracks */}
            {subtitleTracks.map((track) => {
              const isActive = track.index === activeSubtitleIndex

              return (
                <DropdownMenuItem
                  key={`subtitle-${track.index}`}
                  onClick={() => onSelectSubtitle(track.index)}
                  className={cn(
                    'flex items-center justify-between gap-2',
                    isActive && 'bg-accent',
                  )}
                  aria-selected={isActive}
                >
                  <span className="truncate">{track.displayTitle}</span>
                  {isActive && (
                    <Check
                      className="size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                  )}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>
        )}

        {/* Empty state */}
        {!hasTracks && (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            {t('player.tracks.noTracks', 'No tracks available')}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
})
