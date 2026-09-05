import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { AudioLines, Captions, Check, Monitor, Zap } from 'lucide-react'

import { ICON_CLASS, getButtonClass } from './player-ui-constants'
import type { PlaybackStrategy } from '@/services/video/api'
import type { TrackState } from '@/services/video/tracks'
import type { AudioSwitchTranscodeScope } from '@/hooks/use-track-manager'
import { canEnableNativeAudioSwitchingViaBrowserFlag } from '@/services/video/capabilities'
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

interface AudioSwitchHints {
  /** Some or all audio switches restart the stream as a transcode */
  showTranscodeHint: boolean
  /** Every switch transcodes, so the copy is the blanket warning */
  showFullTranscodeHint: boolean
  /** The transcode stems from the missing native API, which a Chromium flag can enable */
  showChromiumFlagTip: boolean
}

function getAudioSwitchHints(
  audioSwitchTranscodeScope: AudioSwitchTranscodeScope,
): AudioSwitchHints {
  const showFullTranscodeHint = audioSwitchTranscodeScope === 'all'
  return {
    showTranscodeHint: audioSwitchTranscodeScope !== 'none',
    showFullTranscodeHint,
    // Pointless when the API is already exposed and the transcode hint stems
    // from an undecodable codec instead of the missing API.
    showChromiumFlagTip:
      showFullTranscodeHint && canEnableNativeAudioSwitchingViaBrowserFlag(),
  }
}

/** Space-separated ids of the hints that render, for `aria-describedby`. */
function getMenuDescriptionIds(
  hints: AudioSwitchHints,
  ids: { transcodeHintId: string; flagTipId: string },
): string | undefined {
  const hintIds: Array<string> = []
  if (hints.showTranscodeHint) hintIds.push(ids.transcodeHintId)
  if (hints.showChromiumFlagTip) hintIds.push(ids.flagTipId)
  return hintIds.length > 0 ? hintIds.join(' ') : undefined
}

function StrategyBadge({ strategy }: { strategy: PlaybackStrategy }) {
  const { t } = useTranslation()
  const isDirect = strategy === 'direct'
  const StrategyIcon = isDirect ? Zap : Monitor

  return (
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
  )
}

function TrackMenuItem({
  label,
  isActive,
  onSelect,
}: {
  label: string
  isActive: boolean
  onSelect: () => void
}) {
  return (
    <DropdownMenuItem
      onClick={onSelect}
      className={cn(
        'flex items-center justify-between gap-2',
        isActive && 'bg-accent',
      )}
      aria-selected={isActive}
    >
      <span className="truncate">{label}</span>
      {isActive && (
        <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
      )}
    </DropdownMenuItem>
  )
}

function AudioTrackGroup({
  audioTracks,
  activeAudioIndex,
  onSelectAudio,
  hints,
  transcodeHintId,
  flagTipId,
}: Pick<TrackState, 'audioTracks' | 'activeAudioIndex'> &
  Pick<TrackSelectorProps, 'onSelectAudio'> & {
    hints: AudioSwitchHints
    transcodeHintId: string
    flagTipId: string
  }) {
  const { t } = useTranslation()

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="flex items-center gap-2">
        <AudioLines className="size-4" aria-hidden="true" />
        {t('player.tracks.audio', 'Audio')}
      </DropdownMenuLabel>

      {audioTracks.map((track) => (
        <TrackMenuItem
          key={`audio-${track.index}`}
          label={track.displayTitle}
          isActive={track.index === activeAudioIndex}
          onSelect={() => onSelectAudio(track.index)}
        />
      ))}

      {/* When only some targets restart the stream (e.g. one DTS
          track), the blanket copy would be wrong in both directions. */}
      {hints.showTranscodeHint && (
        <p
          id={transcodeHintId}
          className="px-3 pb-1 text-xs text-muted-foreground"
        >
          {hints.showFullTranscodeHint
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
      {hints.showChromiumFlagTip && (
        <p id={flagTipId} className="px-3 pb-1 text-xs text-muted-foreground">
          {t(
            'player.tracks.audioSwitchChromiumFlagTip',
            'Tip: Chromium browsers can switch audio in place when “Experimental Web Platform features” is enabled in chrome://flags',
          )}
        </p>
      )}
    </DropdownMenuGroup>
  )
}

function SubtitleTrackGroup({
  subtitleTracks,
  activeSubtitleIndex,
  onSelectSubtitle,
}: Pick<TrackState, 'subtitleTracks' | 'activeSubtitleIndex'> &
  Pick<TrackSelectorProps, 'onSelectSubtitle'>) {
  const { t } = useTranslation()

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="flex items-center gap-2">
        <Captions className="size-4" aria-hidden="true" />
        {t('player.tracks.subtitle', 'Subtitles')}
      </DropdownMenuLabel>

      <TrackMenuItem
        label={t('player.tracks.off', 'Off')}
        isActive={activeSubtitleIndex === null}
        onSelect={() => onSelectSubtitle(null)}
      />

      {subtitleTracks.map((track) => (
        <TrackMenuItem
          key={`subtitle-${track.index}`}
          label={track.displayTitle}
          isActive={track.index === activeSubtitleIndex}
          onSelect={() => onSelectSubtitle(track.index)}
        />
      ))}
    </DropdownMenuGroup>
  )
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

  // Associate the hints with the menu so screen readers announce them when
  // the menu opens; a bare <p> between menu items is skipped by arrow-key
  // navigation and would leave the transcode warning silent.
  const transcodeHintId = useId()
  const flagTipId = useId()
  const hints = getAudioSwitchHints(audioSwitchTranscodeScope)
  const menuDescriptionIds = getMenuDescriptionIds(hints, {
    transcodeHintId,
    flagTipId,
  })

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
        aria-describedby={menuDescriptionIds}
      >
        {strategy && (
          <>
            <StrategyBadge strategy={strategy} />
            {hasTracks && <DropdownMenuSeparator />}
          </>
        )}

        {hasAudioTracks && (
          <AudioTrackGroup
            audioTracks={audioTracks}
            activeAudioIndex={activeAudioIndex}
            onSelectAudio={onSelectAudio}
            hints={hints}
            transcodeHintId={transcodeHintId}
            flagTipId={flagTipId}
          />
        )}

        {hasAudioTracks && hasSubtitleTracks && <DropdownMenuSeparator />}

        {hasSubtitleTracks && (
          <SubtitleTrackGroup
            subtitleTracks={subtitleTracks}
            activeSubtitleIndex={activeSubtitleIndex}
            onSelectSubtitle={onSelectSubtitle}
          />
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
