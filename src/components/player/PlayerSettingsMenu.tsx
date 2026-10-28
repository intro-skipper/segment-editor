import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreVertical } from 'lucide-react'

import {
  usePlayback,
  usePlaybackEngine,
  usePlaybackTracks,
  useSubtitleOffset,
} from './playback-context'

import { formatForDisplay } from '@tanstack/react-hotkeys'
import type React from 'react'
import { PLAYER_SHORTCUT_CHEATSHEET } from '@/lib/player-shortcuts'
import {
  formatSkipDurationLabel,
  isFrameSkipSeconds,
} from '@/lib/player-timing-utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PLAYER_CONFIG } from '@/lib/constants'

const { SKIP_TIMES, PLAYBACK_SPEEDS } = PLAYER_CONFIG

const CHEATSHEET_DISPLAY = PLAYER_SHORTCUT_CHEATSHEET.map((entry) => ({
  labelKey: entry.labelKey,
  displayKeys: entry.hotkeys.map((hotkey) => formatForDisplay(hotkey)),
}))

export interface PlayerSettingsMenuProps {
  skipTimeIndex: number
  onSkipTimeChange: (index: number) => void
}

/** Skip size, playback speed, subtitle offset and the shortcut cheatsheet. */
export function PlayerSettingsMenu({
  skipTimeIndex,
  onSkipTimeChange,
  portalContainer,
}: PlayerSettingsMenuProps & {
  portalContainer: React.RefObject<HTMLElement | null>
}) {
  const { t } = useTranslation()
  const idPrefix = useId()
  const engine = usePlaybackEngine()
  const playbackSpeedIndex = usePlayback((s) => s.speedIndex)
  const hasActiveSubtitle = usePlaybackTracks(
    (s) => s.activeSubtitleIndex !== null,
  )
  const subtitleOffset = useSubtitleOffset()

  const handleSubtitleOffsetChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    engine.subtitles.setOffset(parseFloat(e.target.value))
  }

  const handleSubtitleOffsetReset = () => {
    engine.subtitles.setOffset(0)
  }

  const shortcutItems = CHEATSHEET_DISPLAY.map(({ labelKey, displayKeys }) => (
    <div key={labelKey} className="flex justify-between items-center">
      <span className="text-muted-foreground">{t(labelKey)}</span>
      <span>
        {displayKeys.map((dk) => (
          <kbd key={dk} className="ms-1">
            {dk}
          </kbd>
        ))}
      </span>
    </div>
  ))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="player"
            size="icon-xl"
            aria-label={t('accessibility.playerSettings', 'Player settings')}
          />
        }
      >
        <MoreVertical strokeWidth={3} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-70"
        container={portalContainer}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel id={`${idPrefix}-skip-duration`}>
            {t('player.skipDuration', 'Skip Duration')}
          </DropdownMenuLabel>
          <div
            className="flex flex-wrap gap-1.5 px-3 pbe-2"
            role="radiogroup"
            aria-labelledby={`${idPrefix}-skip-duration`}
          >
            {SKIP_TIMES.map((time, idx) => {
              const label = formatSkipDurationLabel(time)
              const ariaLabel = isFrameSkipSeconds(time)
                ? t('player.skipOneFrame', 'Skip 1 frame')
                : t('player.skipSeconds', 'Skip {{time}} seconds', { time })
              return (
                <Button
                  type="button"
                  key={time}
                  size="sm"
                  variant="outline"
                  onClick={() => onSkipTimeChange(idx)}
                  role="radio"
                  aria-checked={idx === skipTimeIndex}
                  aria-label={ariaLabel}
                >
                  {label}
                </Button>
              )
            })}
          </div>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel id={`${idPrefix}-playback-speed`}>
            {t('player.playbackSpeed', 'Playback Speed')}
          </DropdownMenuLabel>
          <div
            className="flex flex-wrap gap-1.5 px-3 pbe-2"
            role="radiogroup"
            aria-labelledby={`${idPrefix}-playback-speed`}
          >
            {PLAYBACK_SPEEDS.map((speed, idx) => (
              <Button
                type="button"
                key={speed}
                size="sm"
                variant="outline"
                onClick={() => engine.setSpeedIndex(idx)}
                role="radio"
                aria-checked={idx === playbackSpeedIndex}
                aria-label={t('player.speedValue', '{{speed}}x speed', {
                  speed,
                })}
              >
                {speed}x
              </Button>
            ))}
          </div>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        {hasActiveSubtitle && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel id={`${idPrefix}-subtitle-offset`}>
                {t('player.subtitleOffset', 'Subtitle Offset')}
              </DropdownMenuLabel>
              <div className="flex flex-col gap-2 px-3 pbe-2">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="-10"
                    max="10"
                    step="0.1"
                    value={subtitleOffset}
                    onChange={handleSubtitleOffsetChange}
                    aria-labelledby={`${idPrefix}-subtitle-offset`}
                    aria-valuemin={-10}
                    aria-valuemax={10}
                    aria-valuenow={subtitleOffset}
                    aria-valuetext={t(
                      'player.subtitleOffsetValue',
                      '{{offset}}s',
                      { offset: subtitleOffset.toFixed(1) },
                    )}
                    className="flex-1 h-2 appearance-none rounded-full bg-primary/20 cursor-pointer range-thumb"
                  />
                  <span className="text-sm tabular-nums min-w-12 text-end">
                    {subtitleOffset > 0 ? '+' : ''}
                    {subtitleOffset.toFixed(1)}s
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t('player.subtitleEarlier', 'Earlier')}</span>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={handleSubtitleOffsetReset}
                    disabled={subtitleOffset === 0}
                  >
                    {t('player.subtitleReset', 'Reset')}
                  </Button>
                  <span>{t('player.subtitleLater', 'Later')}</span>
                </div>
              </div>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {t('player.keyboardShortcuts', 'Keyboard Shortcuts')}
          </DropdownMenuLabel>
          <div className="flex flex-col gap-1.5 px-3 pbe-2 text-sm">
            {shortcutItems}
          </div>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
