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

interface TrackSelectorProps {
  trackState: TrackState
  onSelectAudio: (index: number) => void
  onSelectSubtitle: (index: number | null) => void
  strategy?: PlaybackStrategy
  disabled?: boolean
  getButtonStyle?: (active?: boolean) => React.CSSProperties | undefined
  iconColor?: string
  hasColors?: boolean
  className?: string
  portalContainer?: React.RefObject<HTMLElement | null>
}

export const TrackSelector = memo(function TrackSelectorComponent({
  trackState,
  onSelectAudio,
  onSelectSubtitle,
  strategy,
  disabled = false,
  getButtonStyle,
  iconColor,
  hasColors = false,
  className,
  portalContainer,
}: TrackSelectorProps) {
  const { t } = useTranslation()

  const { audioTracks, subtitleTracks, activeAudioIndex, activeSubtitleIndex } =
    trackState

  const hasAudioTracks = audioTracks.length > 0
  const hasSubtitleTracks = subtitleTracks.length > 0
  const hasTracks = hasAudioTracks || hasSubtitleTracks

  const isDirect = strategy === 'direct'
  const StrategyIcon = isDirect ? Zap : Monitor

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
        container={portalContainer}
      >
        {strategy && (
          <>
            <div className="px-3 py-2">
              <output
                className={cn(
                  'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium',
                  isDirect
                    ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                    : 'bg-blue-500/10 text-blue-600 border border-blue-500/20',
                )}
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
              </output>
            </div>
            {hasTracks && <DropdownMenuSeparator />}
          </>
        )}

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

        {hasAudioTracks && hasSubtitleTracks && <DropdownMenuSeparator />}

        {hasSubtitleTracks && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-2">
              <Captions className="size-4" aria-hidden="true" />
              {t('player.tracks.subtitle', 'Subtitles')}
            </DropdownMenuLabel>

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

        {!hasTracks && (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            {t('player.tracks.noTracks', 'No tracks available')}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
})
