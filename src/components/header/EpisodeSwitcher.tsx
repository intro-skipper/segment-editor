/**
 * EpisodeSwitcher - Responsive episode selector for video player header.
 */

import { memo, useCallback, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Check, ChevronDown, Play } from 'lucide-react'

import type { BaseItemDto } from '@/types/jellyfin'
import type { VibrantColors } from '@/hooks/use-vibrant-color'
import { useEpisodes, useSeasons } from '@/hooks/queries/use-items'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'

export interface EpisodeSwitcherProps {
  currentEpisode: BaseItemDto
  vibrantColors?: VibrantColors | null
  className?: string
}

// Shared style utilities
const useAccentStyle = (
  isActive: boolean,
  colors: VibrantColors | null | undefined,
  bgOpacity: string,
) =>
  useMemo(
    () =>
      isActive && colors
        ? {
            backgroundColor: `${colors.accent}${bgOpacity}`,
            color: colors.accent,
          }
        : undefined,
    [isActive, colors, bgOpacity],
  )

const TICKS_TO_MINUTES = 600_000_000

const EpisodeItemSkeleton = memo(function EpisodeItemSkeleton({
  index = 0,
}: {
  index?: number
}) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 animate-in fade-in duration-300"
      style={{ animationDelay: `${index * 40}ms` }}
      aria-hidden="true"
    >
      <Skeleton className="size-8 rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  )
})

interface EpisodeItemProps {
  episode: BaseItemDto
  isActive: boolean
  index: number
  onSelect: (episodeId: string) => void
  vibrantColors?: VibrantColors | null
}

const EpisodeItem = memo(function EpisodeItem({
  episode,
  isActive,
  index,
  onSelect,
  vibrantColors,
}: EpisodeItemProps) {
  const episodeNum = episode.IndexNumber ?? index + 1
  const runtime = episode.RunTimeTicks
    ? Math.round(episode.RunTimeTicks / TICKS_TO_MINUTES)
    : null
  const episodeName = episode.Name || `Episode ${episodeNum}`

  const handleClick = useCallback(() => {
    if (episode.Id) onSelect(episode.Id)
  }, [episode.Id, onSelect])

  const accentStyle = useAccentStyle(isActive, vibrantColors, '20')
  const badgeStyle = useAccentStyle(isActive, vibrantColors, '30')

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left',
        'transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isActive
          ? 'bg-primary/15 text-primary'
          : 'hover:bg-muted/80 text-foreground',
      )}
      style={accentStyle}
      role="option"
      aria-selected={isActive}
      aria-label={`Episode ${episodeNum}: ${episodeName}${runtime ? `, ${runtime} minutes` : ''}${isActive ? ', currently playing' : ''}`}
    >
      <span
        className={cn(
          'flex-shrink-0 size-8 flex items-center justify-center rounded-lg text-sm font-bold tabular-nums transition-colors duration-150',
          isActive
            ? 'bg-primary/20 text-primary'
            : 'bg-muted/60 text-muted-foreground group-hover:bg-muted group-hover:text-foreground',
        )}
        style={badgeStyle}
        aria-hidden="true"
      >
        {isActive ? <Check className="size-4" strokeWidth={3} /> : episodeNum}
      </span>

      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'font-medium truncate text-sm leading-tight',
            isActive && 'font-semibold',
          )}
        >
          {episodeName}
        </p>
        {runtime && (
          <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
            {runtime} min
          </p>
        )}
      </div>

      <Play
        className={cn(
          'size-4 flex-shrink-0 transition-opacity duration-150',
          isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
        fill="currentColor"
        strokeWidth={0}
        aria-hidden="true"
      />
    </button>
  )
})

interface SeasonSelectorProps {
  seasons: Array<BaseItemDto>
  selectedSeasonId: string | null
  onSeasonSelect: (seasonId: string) => void
  vibrantColors?: VibrantColors | null
}

const SeasonSelector = memo(function SeasonSelector({
  seasons,
  selectedSeasonId,
  onSeasonSelect,
  vibrantColors,
}: SeasonSelectorProps) {
  if (seasons.length <= 1) return null

  return (
    <div
      className="flex gap-1.5 px-2 pb-2 overflow-x-auto scrollbar-hide"
      role="tablist"
      aria-label="Select season"
    >
      {seasons.map((season) => {
        const isSelected = season.Id === selectedSeasonId
        const label =
          season.IndexNumber === 0 ? 'SP' : `S${season.IndexNumber ?? '?'}`
        const fullLabel =
          season.IndexNumber === 0
            ? 'Specials'
            : `Season ${season.IndexNumber ?? '?'}`

        return (
          <button
            key={season.Id}
            type="button"
            onClick={() => season.Id && onSeasonSelect(season.Id)}
            className={cn(
              'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 ease-out',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isSelected
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            style={
              isSelected && vibrantColors
                ? {
                    backgroundColor: vibrantColors.accent,
                    color: vibrantColors.accentText,
                  }
                : undefined
            }
            role="tab"
            aria-selected={isSelected}
            aria-label={fullLabel}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
})

// Episode list content renderer - reduces cyclomatic complexity
const EpisodeListContent = memo(function EpisodeListContent({
  episodes,
  currentEpisodeId,
  isLoading,
  isError,
  onSelect,
  vibrantColors,
  t,
}: {
  episodes: Array<BaseItemDto>
  currentEpisodeId: string | undefined
  isLoading: boolean
  isError: boolean
  onSelect: (id: string) => void
  vibrantColors?: VibrantColors | null
  t: (key: string, fallback: string) => string
}) {
  if (isLoading) {
    return (
      <div
        className="space-y-0.5"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span className="sr-only">Loading episodes</span>
        {[0, 1, 2, 3].map((i) => (
          <EpisodeItemSkeleton key={i} index={i} />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div
        className="flex flex-col items-center justify-center py-8 text-muted-foreground"
        role="alert"
      >
        <AlertCircle className="size-6 mb-2 opacity-60" aria-hidden="true" />
        <p className="text-sm">
          {t('series.loadError', 'Failed to load episodes')}
        </p>
      </div>
    )
  }

  if (episodes.length === 0) {
    return (
      <p
        className="text-center text-muted-foreground text-sm py-8"
        role="status"
      >
        {t('series.noEpisodes', 'No episodes found')}
      </p>
    )
  }

  return (
    <div className="space-y-0.5" role="listbox" aria-label="Episodes">
      {episodes.map((episode, index) => (
        <EpisodeItem
          key={episode.Id}
          episode={episode}
          isActive={episode.Id === currentEpisodeId}
          index={index}
          onSelect={onSelect}
          vibrantColors={vibrantColors}
        />
      ))}
    </div>
  )
})

export function EpisodeSwitcher({
  currentEpisode,
  vibrantColors,
  className,
}: EpisodeSwitcherProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const { SeriesId: seriesId, SeasonId: currentSeasonId } = currentEpisode
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(
    currentSeasonId ?? null,
  )

  const { data: seasons = [] } = useSeasons(seriesId ?? '', {
    enabled: !!seriesId,
  })
  const {
    data: episodes = [],
    isLoading,
    isError,
  } = useEpisodes(seriesId ?? '', selectedSeasonId ?? '', {
    enabled: !!seriesId && !!selectedSeasonId,
  })

  // Sync selectedSeasonId when currentSeasonId changes
  if (currentSeasonId && currentSeasonId !== selectedSeasonId) {
    setSelectedSeasonId(currentSeasonId)
  }

  const handleEpisodeSelect = useCallback(
    (episodeId: string) => {
      setOpen(false)
      navigate({
        to: '/player/$itemId',
        params: { itemId: episodeId },
        search: { fetchSegments: 'true' },
      })
    },
    [navigate],
  )

  if (!seriesId || currentEpisode.Type !== 'Episode') return null

  const episodeLabel = `S${currentEpisode.ParentIndexNumber ?? '?'}E${currentEpisode.IndexNumber ?? '?'}`
  const displayTitle = currentEpisode.Name
    ? `${episodeLabel} ${currentEpisode.Name}`
    : episodeLabel

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className={cn(
          'flex items-center gap-2 min-w-0 max-w-full hover:opacity-80 transition-opacity',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md',
          className,
        )}
        aria-label={t('player.selectEpisode', 'Select episode')}
      >
        <h1
          className="text-2xl sm:text-3xl font-bold tracking-tight truncate"
          style={vibrantColors ? { color: vibrantColors.text } : undefined}
        >
          {displayTitle}
        </h1>
        <ChevronDown
          className="size-5 flex-shrink-0 text-muted-foreground"
          aria-hidden
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="w-72 max-h-[min(420px,70vh)] p-0 bg-popover/95 backdrop-blur-xl border-border/50 shadow-2xl overflow-hidden"
      >
        {seasons.length > 1 && (
          <>
            <div className="pt-2">
              <SeasonSelector
                seasons={seasons}
                selectedSeasonId={selectedSeasonId}
                onSeasonSelect={setSelectedSeasonId}
                vibrantColors={vibrantColors}
              />
            </div>
            <DropdownMenuSeparator className="my-0" />
          </>
        )}

        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-3 py-2 text-xs uppercase tracking-wider">
            {t('series.episodes', 'Episodes')}
            {episodes.length > 0 && (
              <span className="ml-1.5 opacity-60">({episodes.length})</span>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <div
          className="overflow-y-auto max-h-[min(320px,50vh)] px-1.5 pb-1.5"
          role="tabpanel"
        >
          <EpisodeListContent
            episodes={episodes}
            currentEpisodeId={currentEpisode.Id}
            isLoading={isLoading}
            isError={isError}
            onSelect={handleEpisodeSelect}
            vibrantColors={vibrantColors}
            t={t}
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default EpisodeSwitcher
