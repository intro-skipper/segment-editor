import { useTranslation } from 'react-i18next'
import { AudioLines, Captions, Check, Monitor, Zap } from 'lucide-react'

import { ICON_CLASS, getButtonClass } from './player-ui-constants'
import type { PlaybackStrategy } from '@/services/video/api'
import type { TrackState } from '@/services/video/tracks'
import type { AudioSwitchTranscodeScope } from '@/hooks/use-track-manager'
import {
  isFirefox,
  isSafari,
  supportsNativeAudioTrackSwitching,
} from '@/services/video/capabilities'
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
  /** Which audio switch targets restart the stream as a transcode */
  audioSwitchTranscodeScope?: AudioSwitchTranscodeScope
  disabled?: boolean
  className?: string
  portalContainer?: React.RefObject<HTMLElement | null>
}

export const TrackSelector = function TrackSelectorComponent({
  trackState,
  onSelectAudio,
  onSelectSubtitle,
  strategy,
  audioSwitchTranscodeScope = 'none',
  disabled = false,
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
  const showTranscodeHint = audioSwitchTranscodeScope === 'all'
  // Chromium-only: Firefox has no flag for the audioTracks API (it is not
  // implemented at all) and Safari ships it natively, so the tip would be
  // misleading on both. It is also pointless when the API is already exposed
  // and the transcode hint stems from an undecodable codec instead.
  const showChromiumFlagTip =
    showTranscodeHint &&
    !supportsNativeAudioTrackSwitching() &&
    !isFirefox() &&
    !isSafari()

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
            className={cn(getButtonClass(false), className)}
          />
        }
      >
        <AudioLines
          className={ICON_CLASS}
          strokeWidth={2.5}
          aria-hidden="true"
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

            {/* When only some targets restart the stream (e.g. one DTS
                track), the blanket copy would be wrong in both directions. */}
            {audioSwitchTranscodeScope !== 'none' && (
              <p className="px-3 pb-1 text-xs text-muted-foreground">
                {showTranscodeHint
                  ? t(
                      'player.tracks.audioSwitchTranscodeHint',
                      'Switching audio restarts the stream as a transcode',
                    )
                  : t(
                      'player.tracks.audioSwitchPartialTranscodeHint',
                      'Switching to some audio tracks restarts the stream as a transcode',
                    )}
              </p>
            )}
            {showChromiumFlagTip && (
              <p className="px-3 pb-1 text-xs text-muted-foreground">
                {t(
                  'player.tracks.audioSwitchChromiumFlagTip',
                  'Tip: Chromium browsers can switch audio in place when "Experimental Web Platform features" is enabled in chrome://flags',
                )}
              </p>
            )}
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
}
