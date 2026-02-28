/**
 * PlayerSettingsMenu - Settings dropdown for skip duration, playback speed,
 * subtitle offset, and keyboard shortcut cheatsheet.
 * Extracted from PlayerControls to keep component sizes manageable.
 */

import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreVertical } from 'lucide-react'

import { formatForDisplay } from '@tanstack/react-hotkeys'
import { ICON_CLASS, getButtonClass, getIconStyle } from './player-ui-constants'
import type React from 'react'
import { cn } from '@/lib/utils'
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

/** Pre-computed display strings for shortcut keys (platform-aware, e.g. ⌘ on Mac) */
const CHEATSHEET_DISPLAY = PLAYER_SHORTCUT_CHEATSHEET.map((entry) => ({
  labelKey: entry.labelKey,
  displayKeys: entry.hotkeys.map(formatForDisplay),
}))

interface PlayerSettingsMenuProps {
  skipTimeIndex: number
  hasColors: boolean
  iconColor: string | undefined
  applyButtonStyle: (active?: boolean) => React.CSSProperties | undefined
  onSkipTimeChange: (index: number) => void
  /** Current subtitle offset in seconds (positive = delay, negative = advance) */
  subtitleOffset: number
  /** Callback when subtitle offset changes */
  onSubtitleOffsetChange?: (offset: number) => void
  /** Whether subtitles are currently active */
  hasActiveSubtitle: boolean
  /** Current playback speed index into PLAYBACK_SPEEDS */
  playbackSpeedIndex?: number
  /** Callback when playback speed changes */
  onSpeedChange?: (speedIndex: number) => void
}

export function PlayerSettingsMenu({
  skipTimeIndex,
  hasColors,
  iconColor,
  applyButtonStyle,
  onSkipTimeChange,
  subtitleOffset,
  onSubtitleOffsetChange,
  hasActiveSubtitle,
  playbackSpeedIndex,
  onSpeedChange,
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
          <kbd
            key={dk}
            className="px-2 py-0.5 bg-muted rounded text-xs font-mono ml-1"
          >
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
            variant="outline"
            aria-label={t('accessibility.playerSettings', 'Player settings')}
            style={applyButtonStyle()}
            className={getButtonClass(false, hasColors)}
          />
        }
      >
        <MoreVertical
          className={ICON_CLASS}
          strokeWidth={3}
          aria-hidden="true"
          style={getIconStyle(iconColor)}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="p-4 min-w-[280px]">
        {/* Skip Duration */}
        <div className="mb-4 pb-4 border-b border-border">
          <p
            className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide"
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
                <button
                  key={time}
                  onClick={() => onSkipTimeChange(idx)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    idx === skipTimeIndex
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-muted/80 text-foreground',
                  )}
                  role="radio"
                  aria-checked={idx === skipTimeIndex}
                  aria-label={ariaLabel}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Playback Speed */}
        {onSpeedChange && playbackSpeedIndex !== undefined && (
          <div className="mb-4 pb-4 border-b border-border">
            <p
              className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide"
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
                <button
                  key={speed}
                  onClick={() => onSpeedChange(idx)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    idx === playbackSpeedIndex
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-muted/80 text-foreground',
                  )}
                  role="radio"
                  aria-checked={idx === playbackSpeedIndex}
                  aria-label={t('player.speedValue', '{{speed}}x speed', {
                    speed,
                  })}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Subtitle Offset - only shown when subtitles are active */}
        {hasActiveSubtitle && onSubtitleOffsetChange && (
          <div className="mb-4 pb-4 border-b border-border">
            <p
              className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide"
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
                <span className="text-sm font-mono min-w-[6ch] text-right">
                  {subtitleOffset > 0 ? '+' : ''}
                  {subtitleOffset.toFixed(1)}s
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t('player.subtitleEarlier', 'Earlier')}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSubtitleOffsetReset}
                  className="h-6 px-2 text-xs"
                  disabled={subtitleOffset === 0}
                >
                  {t('player.subtitleReset', 'Reset')}
                </Button>
                <span>{t('player.subtitleLater', 'Later')}</span>
              </div>
            </div>
          </div>
        )}

        {/* Keyboard Shortcuts */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            {t('player.keyboardShortcuts', 'Keyboard Shortcuts')}
          </p>
          <div className="space-y-1.5 text-sm">{shortcutItems}</div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
