import { formatForDisplay, useHotkey } from '@tanstack/react-hotkeys'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import type { BaseItemDto } from '@/types/jellyfin'
import { useAdjacentEpisodes } from '@/services/items/queries'
import { Button } from '@/components/ui/button'
import EpisodeSwitcher from '@/components/header/EpisodeSwitcher'
import { formatEpisodeLabel } from '@/lib/header-utils'
import { EPISODE_HOTKEYS } from '@/lib/player-shortcuts'
import { cn } from '@/lib/utils'
import { useEpisodeRouteNavigation } from './use-episode-route-navigation'

const PREVIOUS_HOTKEY_DISPLAY = formatForDisplay(
  EPISODE_HOTKEYS.previousEpisode,
)
const NEXT_HOTKEY_DISPLAY = formatForDisplay(EPISODE_HOTKEYS.nextEpisode)

interface EpisodeArrowProps {
  /** The Adjacent Episode this arrow leads to; null disables the arrow at a series boundary. */
  target: BaseItemDto | null
  label: string
  hotkeyDisplay: string
  icon: typeof ChevronLeft
  onSelect: (episodeId: string) => void
  onIntent: (episodeId: string) => void
}

function EpisodeArrow({
  target,
  label,
  hotkeyDisplay,
  icon: Icon,
  onSelect,
  onIntent,
}: EpisodeArrowProps) {
  const targetId = target?.Id
  const targetLabel = formatEpisodeLabel(target)
  const intent = () => {
    if (targetId) onIntent(targetId)
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={!targetId}
      onClick={() => {
        if (targetId) onSelect(targetId)
      }}
      onPointerEnter={intent}
      onFocus={intent}
      className="rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30"
      aria-label={targetLabel ? `${label}: ${targetLabel}` : label}
      title={`${targetLabel ?? label} (${hotkeyDisplay})`}
    >
      <Icon className="size-6" aria-hidden />
    </Button>
  )
}

interface EpisodeNavigationProps {
  currentEpisode: BaseItemDto
  className?: string
}

/**
 * Header control for the player page: previous and next arrows flanking the
 * Episode Switcher, plus the Shift+P / Shift+N hotkeys that do the same thing.
 * Arrows stay visible but disabled at the first and last episode of the series.
 */
export default function EpisodeNavigation({
  currentEpisode,
  className,
}: EpisodeNavigationProps) {
  const { t } = useTranslation()
  const { data: adjacent } = useAdjacentEpisodes(currentEpisode)
  const { goToEpisode, preloadEpisode } = useEpisodeRouteNavigation()
  const previous = adjacent?.previous ?? null
  const next = adjacent?.next ?? null

  useHotkey(EPISODE_HOTKEYS.previousEpisode, () => {
    if (previous?.Id) goToEpisode(previous.Id)
  })
  useHotkey(EPISODE_HOTKEYS.nextEpisode, () => {
    if (next?.Id) goToEpisode(next.Id)
  })

  if (!currentEpisode.SeriesId || currentEpisode.Type !== 'Episode') return null

  return (
    <div className={cn('flex items-center gap-1 min-w-0', className)}>
      <EpisodeArrow
        target={previous}
        label={t('player.previousEpisode', 'Previous episode')}
        hotkeyDisplay={PREVIOUS_HOTKEY_DISPLAY}
        icon={ChevronLeft}
        onSelect={goToEpisode}
        onIntent={preloadEpisode}
      />
      <EpisodeSwitcher currentEpisode={currentEpisode} className="min-w-0" />
      <EpisodeArrow
        target={next}
        label={t('player.nextEpisode', 'Next episode')}
        hotkeyDisplay={NEXT_HOTKEY_DISPLAY}
        icon={ChevronRight}
        onSelect={goToEpisode}
        onIntent={preloadEpisode}
      />
    </div>
  )
}
