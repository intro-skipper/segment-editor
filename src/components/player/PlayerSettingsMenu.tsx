import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreVertical } from 'lucide-react'

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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PLAYER_CONFIG } from '@/lib/constants'

const { SKIP_TIMES, PLAYBACK_SPEEDS } = PLAYER_CONFIG

const CHEATSHEET_DISPLAY = PLAYER_SHORTCUT_CHEATSHEET.map((entry) => ({
  labelKey: entry.labelKey,
  displayKeys: entry.hotkeys.map(formatForDisplay),
}))

interface PlayerSettingsMenuProps {
  skipTimeIndex: number
  onSkipTimeChange: (index: number) => void
  subtitleOffset: number
  onSubtitleOffsetChange?: (offset: number) => void
  hasActiveSubtitle: boolean
  playbackSpeedIndex?: number
  onSpeedChange?: (speedIndex: number) => void
  portalContainer?: React.RefObject<HTMLElement | null>
}

export function PlayerSettingsMenu({
  skipTimeIndex,
  onSkipTimeChange,
  subtitleOffset,
  onSubtitleOffsetChange,
  hasActiveSubtitle,
  playbackSpeedIndex,
  onSpeedChange,
  portalContainer,
}: PlayerSettingsMenuProps) {
  const { t } = useTranslation()
  const idPrefix = useId()

  const handleSubtitleOffsetChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    onSubtitleOffsetChange?.(parseFloat(e.target.value))
  }

  const handleSubtitleOffsetReset = () => {
    onSubtitleOffsetChange?.(0)
  }

  const shortcutItems = CHEATSHEET_DISPLAY.map(({ labelKey, displayKeys }) => (
    <div key={labelKey} className="flex justify-between items-center">
      <span className="text-muted-foreground">{t(labelKey)}</span>
      <span>
        {displayKeys.map((dk) => (
          <kbd key={dk} className="ml-1">
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
        <div className="p-3">
          <div className="mb-4 pb-4 border-b border-border">
            <p
              className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider"
              id={`${idPrefix}-skip-duration`}
            >
              {t('player.skipDuration', 'Skip Duration')}
            </p>
            <div
              className="flex flex-wrap gap-1.5"
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
                    variant={idx === skipTimeIndex ? 'default' : 'secondary'}
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
          </div>

          {onSpeedChange && playbackSpeedIndex !== undefined && (
            <div className="mb-4 pb-4 border-b border-border">
              <p
                className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider"
                id={`${idPrefix}-playback-speed`}
              >
                {t('player.playbackSpeed', 'Playback Speed')}
              </p>
              <div
                className="flex flex-wrap gap-1.5"
                role="radiogroup"
                aria-labelledby={`${idPrefix}-playback-speed`}
              >
                {PLAYBACK_SPEEDS.map((speed, idx) => (
                  <Button
                    type="button"
                    key={speed}
                    size="sm"
                    variant={
                      idx === playbackSpeedIndex ? 'default' : 'secondary'
                    }
                    onClick={() => onSpeedChange(idx)}
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
            </div>
          )}

          {hasActiveSubtitle && onSubtitleOffsetChange && (
            <div className="mb-4 pb-4 border-b border-border">
              <p
                className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider"
                id={`${idPrefix}-subtitle-offset`}
              >
                {t('player.subtitleOffset', 'Subtitle Offset')}
              </p>
              <div className="space-y-2">
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
                    className="flex-1 h-2 appearance-none bg-muted rounded-full cursor-pointer accent-primary"
                  />
                  <span className="text-sm tabular-nums min-w-12 text-right">
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
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
              {t('player.keyboardShortcuts', 'Keyboard Shortcuts')}
            </p>
            <div className="space-y-1.5 text-sm">{shortcutItems}</div>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
