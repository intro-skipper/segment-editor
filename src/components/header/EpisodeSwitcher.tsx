/**
 * EpisodeSwitcher - Responsive episode selector for video player header.
 */

import { memo, useCallback, useRef, useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Check, ChevronDown, Play } from 'lucide-react'

import type { BaseItemDto } from '@/types/jellyfin'
import type { VibrantColors } from '@/hooks/use-vibrant-color'
import { useEpisodes, useSeasons } from '@/hooks/queries/use-items'
import { useVirtualWindow } from '@/hooks/use-virtual-window'
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

interface EpisodeSwitcherProps {
  currentEpisode: BaseItemDto
  vibrantColors?: VibrantColors | null
  className?: string
}

const TICKS_TO_MINUTES = 600_000_000
const EPISODE_ROW_ESTIMATE_PX = 58
const VIRTUALIZE_THRESHOLD = 40
const EPISODE_OVERSCAN = 6

const EpisodeItemSkeleton = memo(function EpisodeItemSkeletonComponent({
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
  onIntent: (episodeId: string) => void
  vibrantColors?: VibrantColors | null
}

const EpisodeItem = memo(function EpisodeItemComponent({
  episode,
  isActive,
  index,
  onSelect,
  onIntent,
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

  const accentStyle =
    isActive && vibrantColors
      ? {
          backgroundColor: `${vibrantColors.accent}20`,
          color: vibrantColors.accent,
        }
      : undefined
  const badgeStyle =
    isActive && vibrantColors
      ? {
          backgroundColor: `${vibrantColors.accent}30`,
          color: vibrantColors.accent,
        }
      : undefined

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left',
        'transition-[background-color,color,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isActive
          ? 'bg-primary/15 text-primary'
          : 'hover:bg-muted/80 text-foreground',
      )}
      style={accentStyle}
      onPointerEnter={() => {
        if (episode.Id) onIntent(episode.Id)
      }}
      onFocus={() => {
        if (episode.Id) onIntent(episode.Id)
      }}
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

interface SeasonButtonProps {
  season: BaseItemDto
  isSelected: boolean
  onSeasonSelect: (seasonId: string) => void
  vibrantColors?: VibrantColors | null
}

const SeasonButton = memo(function SeasonButtonComponent({
  season,
  isSelected,
  onSeasonSelect,
  vibrantColors,
}: SeasonButtonProps) {
  const handleClick = useCallback(() => {
    if (season.Id) onSeasonSelect(season.Id)
  }, [season.Id, onSeasonSelect])

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
      onClick={handleClick}
      className={cn(
        'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-[background-color,color,box-shadow] duration-150 ease-out',
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
})

interface SeasonSelectorProps {
  seasons: Array<BaseItemDto>
  selectedSeasonId: string | null
  onSeasonSelect: (seasonId: string) => void
  vibrantColors?: VibrantColors | null
}

const SeasonSelector = memo(function SeasonSelectorComponent({
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
        return (
          <SeasonButton
            key={season.Id}
            season={season}
            isSelected={isSelected}
            onSeasonSelect={onSeasonSelect}
            vibrantColors={vibrantColors}
          />
        )
      })}
    </div>
  )
})

// Episode list content renderer - reduces cyclomatic complexity
const EpisodeListContent = memo(function EpisodeListContentComponent({
  episodes,
  currentEpisodeId,
  isLoading,
  isError,
  onSelect,
  onIntent,
  vibrantColors,
  scrollElement,
}: {
  episodes: Array<BaseItemDto>
  currentEpisodeId: string | undefined
  isLoading: boolean
  isError: boolean
  onSelect: (id: string) => void
  onIntent: (id: string) => void
  vibrantColors?: VibrantColors | null
  scrollElement: HTMLDivElement | null
}) {
  const { t } = useTranslation()
  const shouldVirtualize = episodes.length > VIRTUALIZE_THRESHOLD
  const {
    totalSize: totalVirtualHeight,
    startIndex: virtualStartIndex,
    endIndex: virtualEndIndex,
  } = useVirtualWindow({
    enabled: shouldVirtualize,
    scrollElement,
    itemCount: episodes.length,
    itemSize: EPISODE_ROW_ESTIMATE_PX,
    overscan: EPISODE_OVERSCAN,
  })

  if (isLoading) {
    return (
      <div
        className="space-y-0.5"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span className="sr-only">Loading episodes</span>
        {['skeleton-1', 'skeleton-2', 'skeleton-3', 'skeleton-4'].map(
          (skeletonId, index) => (
            <EpisodeItemSkeleton key={skeletonId} index={index} />
          ),
        )}
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

  if (shouldVirtualize) {
    return (
      <div
        role="listbox"
        aria-label="Episodes"
        style={{
          height: totalVirtualHeight,
          position: 'relative',
        }}
      >
        {episodes
          .slice(virtualStartIndex, virtualEndIndex)
          .map((episode, offset) => {
            const episodeIndex = virtualStartIndex + offset

            return (
              <div
                key={episode.Id ?? `episode-${episodeIndex}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${episodeIndex * EPISODE_ROW_ESTIMATE_PX}px)`,
                }}
              >
                <EpisodeItem
                  episode={episode}
                  isActive={episode.Id === currentEpisodeId}
                  index={episodeIndex}
                  onSelect={onSelect}
                  onIntent={onIntent}
                  vibrantColors={vibrantColors}
                />
              </div>
            )
          })}
      </div>
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
          onIntent={onIntent}
          vibrantColors={vibrantColors}
        />
      ))}
    </div>
  )
})

export const EpisodeSwitcher = memo(function EpisodeSwitcherComponent({
  currentEpisode,
  vibrantColors,
  className,
}: EpisodeSwitcherProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const prefetchedEpisodeIdsRef = useRef(new Set<string>())
  const [episodeListElement, setEpisodeListElement] =
    useState<HTMLDivElement | null>(null)

  const { SeriesId: seriesId, SeasonId: currentSeasonId } = currentEpisode
  // overrideSeasonId: set when user manually picks a season tab; null = follow current episode
  const [overrideSeasonId, setOverrideSeasonId] = useState<string | null>(null)
  const selectedSeasonId = overrideSeasonId ?? currentSeasonId ?? null

  const { data: seasons = [] } = useSeasons(seriesId ?? '', {
    enabled: open && !!seriesId,
  })
  const {
    data: episodes = [],
    isLoading,
    isError,
  } = useEpisodes(seriesId ?? '', selectedSeasonId ?? '', {
    enabled: open && !!seriesId && !!selectedSeasonId,
  })

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

  const prefetchEpisodeRoute = useCallback(
    (episodeId: string) => {
      if (!episodeId || prefetchedEpisodeIdsRef.current.has(episodeId)) {
        return
      }

      prefetchedEpisodeIdsRef.current.add(episodeId)
      void router.preloadRoute({
        to: '/player/$itemId',
        params: { itemId: episodeId },
        search: { fetchSegments: 'true' },
      })
    },
    [router],
  )

  const setEpisodeListContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      setEpisodeListElement(node)
    },
    [],
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
                onSeasonSelect={setOverrideSeasonId}
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
          ref={setEpisodeListContainerRef}
          className="overflow-y-auto max-h-[min(320px,50vh)] px-1.5 pb-1.5"
          role="tabpanel"
        >
          <EpisodeListContent
            episodes={episodes}
            currentEpisodeId={currentEpisode.Id}
            isLoading={isLoading}
            isError={isError}
            onSelect={handleEpisodeSelect}
            onIntent={prefetchEpisodeRoute}
            vibrantColors={vibrantColors}
            scrollElement={episodeListElement}
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
})
