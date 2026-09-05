import { formatForDisplay, useHotkey } from '@tanstack/react-hotkeys'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'

import type { BaseItemDto } from '@/types/jellyfin'
import { useAdjacentEpisodes } from '@/services/items/queries'
import { Button } from '@/components/ui/button'
import EpisodeSwitcher from '@/components/header/EpisodeSwitcher'
import { formatEpisodeLabel } from '@/lib/header-utils'
import { EPISODE_HOTKEYS } from '@/lib/player-shortcuts'
import { cn } from '@/lib/utils'
import { useEpisodeRouteNavigation } from './use-episode-route-navigation'

const NEXT_HOTKEY_DISPLAY = formatForDisplay(EPISODE_HOTKEYS.nextEpisode)

interface NextEpisodeArrowProps {
  /** The next Adjacent Episode; null disables the arrow at the end of the series. */
  target: BaseItemDto | null
  label: string
  onSelect: (episodeId: string) => void
  onIntent: (episodeId: string) => void
}

function NextEpisodeArrow({
  target,
  label,
  onSelect,
  onIntent,
}: NextEpisodeArrowProps) {
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
      title={`${targetLabel ?? label} (${NEXT_HOTKEY_DISPLAY})`}
    >
      <ChevronRight className="size-6" aria-hidden />
    </Button>
  )
}

interface EpisodeNavigationProps {
  currentEpisode: BaseItemDto
  className?: string
}

/**
 * Header control for the player page: the Episode Switcher with a next arrow
 * after it, plus Shift+N for next and Shift+P for previous. Only next gets an
 * arrow, so it cannot be confused with the back button; a sweep runs forward
 * and the dropdown covers the rare step back. The arrow stays visible but
 * disabled at the last episode of the series.
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
      <EpisodeSwitcher currentEpisode={currentEpisode} className="min-w-0" />
      <NextEpisodeArrow
        target={next}
        label={t('player.nextEpisode', 'Next episode')}
        onSelect={goToEpisode}
        onIntent={preloadEpisode}
      />
    </div>
  )
}
