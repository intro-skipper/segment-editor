/**
 * SeriesView - Displays series seasons and episodes.
 * Features pill tabs for seasons and clean card list for episodes.
 */

import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import { AlertCircle, Play } from 'lucide-react'

import type { BaseItemDto } from '@/types/jellyfin'
import type { VibrantColors } from '@/hooks/use-vibrant-color'
import { useEpisodes } from '@/hooks/queries/use-items'
import { useVibrantTabStyle } from '@/hooks/use-vibrant-button-style'
import { ItemImage } from '@/components/media/ItemImage'
import { InteractiveCard } from '@/components/ui/interactive-card'
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/ui/async-state'
import { cn } from '@/lib/utils'

export interface SeriesViewProps {
  /** The series item */
  series: BaseItemDto
  /** Array of seasons for the series */
  seasons: Array<BaseItemDto>
  /** Extracted vibrant colors from series poster */
  vibrantColors?: VibrantColors | null
}

// ─────────────────────────────────────────────────────────────────────────────
// SeasonTabs - Pill-style season selector with ARIA support
// ─────────────────────────────────────────────────────────────────────────────

interface SeasonTabsProps {
  seasons: Array<BaseItemDto>
  selectedSeasonId: string | null
  onSeasonSelect: (seasonId: string) => void
  vibrantColors?: VibrantColors | null
}

/** Check if a season is a "Specials" season */
const isSpecialSeason = (s: BaseItemDto) =>
  s.IndexNumber === 0 || (s.Name || '').toLowerCase().includes('special')

const SeasonTabs = React.memo(function SeasonTabs({
  seasons,
  selectedSeasonId,
  onSeasonSelect,
  vibrantColors,
}: SeasonTabsProps) {
  const { getTabStyle, hasColors } = useVibrantTabStyle(vibrantColors ?? null)

  // Memoize sorted seasons - specials always last
  const orderedSeasons = React.useMemo(() => {
    const normal = seasons.filter((s) => !isSpecialSeason(s))
    const specials = seasons.filter(isSpecialSeason)
    return [...normal, ...specials]
  }, [seasons])

  return (
    <div
      className="flex gap-2 md:gap-3 overflow-x-auto pb-2 md:pb-3 scrollbar-hide"
      role="tablist"
      aria-label="Seasons"
    >
      {orderedSeasons.map((season, index) => {
        const isSelected = season.Id === selectedSeasonId
        const label = season.Name ?? `Season ${season.IndexNumber ?? index + 1}`

        return (
          <button
            key={season.Id}
            role="tab"
            aria-selected={isSelected}
            aria-controls={`season-panel-${season.Id}`}
            onClick={() => season.Id && onSeasonSelect(season.Id)}
            className={cn(
              'flex-shrink-0 px-4 py-3 md:px-6 md:py-4 rounded-full text-base md:text-lg font-semibold whitespace-nowrap',
              'transition-all duration-200 ease-out border-2',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              !hasColors &&
                (isSelected
                  ? 'bg-primary/20 text-primary border-primary/40'
                  : 'bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground border-transparent'),
            )}
            style={getTabStyle(isSelected)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// EpisodeCard - Memoized episode display with animation
// ─────────────────────────────────────────────────────────────────────────────

interface EpisodeCardProps {
  episode: BaseItemDto
  index: number
  onClick: () => void
  vibrantColors?: VibrantColors | null
}

const EpisodeCard = React.memo(function EpisodeCard({
  episode,
  index,
  onClick,
  vibrantColors,
}: EpisodeCardProps) {
  const { t } = useTranslation()

  const episodeLabel = `S${episode.ParentIndexNumber ?? '?'}E${episode.IndexNumber ?? '?'}`
  const runtime = episode.RunTimeTicks
    ? Math.round(episode.RunTimeTicks / 600_000_000)
    : null
  const animationDelay = Math.min(index * 40, 400)

  // Memoize style objects to prevent re-renders
  const cardStyle = React.useMemo(
    () =>
      vibrantColors ? { backgroundColor: vibrantColors.primary } : undefined,
    [vibrantColors],
  )
  const textStyle = React.useMemo(
    () => (vibrantColors ? { color: vibrantColors.text } : undefined),
    [vibrantColors],
  )

  const episodeName = episode.Name || episodeLabel
  const ariaLabel = runtime
    ? `${episodeLabel}: ${episodeName}, ${runtime} minutes`
    : `${episodeLabel}: ${episodeName}`

  return (
    <InteractiveCard
      onClick={onClick}
      animate
      animationDelay={animationDelay}
      className={cn(
        'group flex items-center gap-4 p-3 md:p-4 rounded-2xl md:rounded-3xl',
        !vibrantColors && 'bg-card/60 backdrop-blur-sm',
        'hover:shadow-lg hover:shadow-black/10',
      )}
      style={cardStyle}
      aria-label={ariaLabel}
    >
      {/* Thumbnail */}
      <div className="relative flex-shrink-0 w-16 h-16 md:w-24 md:h-24 rounded-xl md:rounded-2xl overflow-hidden bg-muted shadow-md">
        <ItemImage
          item={episode}
          maxWidth={192}
          aspectRatio="aspect-square"
          className="w-full h-full object-cover"
        />
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center',
            'bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200',
          )}
          aria-hidden="true"
        >
          <Play className="size-6 md:size-8 text-white fill-white" />
        </div>
      </div>

      {/* Info */}
      <div className="flex-grow min-w-0 py-0.5 md:py-1">
        <p
          className="font-semibold truncate leading-tight text-base md:text-lg"
          style={textStyle}
        >
          {episode.Name || episodeLabel}
        </p>
        <p
          className="text-sm md:text-base truncate mt-0.5 md:mt-1 opacity-80"
          style={textStyle}
        >
          {episode.Name ? episodeLabel : t('series.episode')}
          {runtime && ` · ${runtime} min`}
        </p>
      </div>
    </InteractiveCard>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// SeasonEpisodes - Episode list with TanStack Query
// ─────────────────────────────────────────────────────────────────────────────

interface SeasonEpisodesProps {
  seriesId: string
  season: BaseItemDto
  vibrantColors?: VibrantColors | null
}

function SeasonEpisodes({
  seriesId,
  season,
  vibrantColors,
}: SeasonEpisodesProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const {
    data: episodes = [],
    isLoading,
    error,
    refetch,
  } = useEpisodes(seriesId, season.Id ?? '', { enabled: !!season.Id })

  const handleEpisodeClick = React.useCallback(
    (episodeId: string) => {
      navigate({
        to: '/player/$itemId',
        params: { itemId: episodeId },
        search: { fetchSegments: 'true' },
      })
    },
    [navigate],
  )

  if (isLoading) {
    return (
      <LoadingState
        message={t('series.loadingEpisodes', {
          season: season.Name ?? season.IndexNumber,
        })}
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        message={t('series.episodeLoadError')}
        onRetry={() => refetch()}
        retryText={t('common.retry')}
      />
    )
  }

  if (episodes.length === 0) {
    return <EmptyState message={t('series.noEpisodes')} />
  }

  // Virtualize only for large lists
  if (episodes.length > 30) {
    return (
      <VirtualizedEpisodeList
        episodes={episodes}
        seasonId={season.Id ?? ''}
        onEpisodeClick={handleEpisodeClick}
        vibrantColors={vibrantColors}
      />
    )
  }

  return (
    <div
      className="space-y-2 md:space-y-3"
      role="tabpanel"
      id={`season-panel-${season.Id}`}
    >
      {episodes.map((episode, index) => (
        <EpisodeCard
          key={episode.Id}
          episode={episode}
          index={index}
          onClick={() => handleEpisodeClick(episode.Id ?? '')}
          vibrantColors={vibrantColors}
        />
      ))}
    </div>
  )
}

/** Virtualized episode list for seasons with many episodes */
interface VirtualizedEpisodeListProps {
  episodes: Array<BaseItemDto>
  seasonId: string
  onEpisodeClick: (episodeId: string) => void
  vibrantColors?: VibrantColors | null
}

function VirtualizedEpisodeList({
  episodes,
  seasonId,
  onEpisodeClick,
  vibrantColors,
}: VirtualizedEpisodeListProps) {
  const parentRef = React.useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: episodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 112, // ~96px card + 16px gap on desktop
    overscan: 5,
  })

  return (
    <div
      ref={parentRef}
      className="h-[600px] md:h-[700px] overflow-auto"
      role="tabpanel"
      id={`season-panel-${seasonId}`}
    >
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const episode = episodes[virtualItem.index]

          return (
            <div
              key={episode.Id}
              className="absolute top-0 left-0 w-full py-1 md:py-1.5"
              style={{
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <EpisodeCard
                episode={episode}
                index={virtualItem.index}
                onClick={() => onEpisodeClick(episode.Id ?? '')}
                vibrantColors={vibrantColors}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SeriesView - Main component
// ─────────────────────────────────────────────────────────────────────────────

export function SeriesView({
  series,
  seasons,
  vibrantColors,
}: SeriesViewProps) {
  const { t } = useTranslation()

  const findDefaultSeasonId = React.useCallback(() => {
    const firstNonSpecial = seasons.find((s) => !isSpecialSeason(s))
    return firstNonSpecial?.Id ?? seasons[0]?.Id ?? null
  }, [seasons])

  const [selectedSeasonId, setSelectedSeasonId] = React.useState<string | null>(
    () => findDefaultSeasonId(),
  )

  const selectedSeason = seasons.find((s) => s.Id === selectedSeasonId)

  // Keep selection in sync when `seasons` prop changes (e.g. navigating to
  // another series). If the previously selected season is not present in the
  // new list, pick the first season (or null if none).
  React.useEffect(() => {
    if (seasons.length === 0) {
      setSelectedSeasonId(null)
      return
    }

    const hasSelected = selectedSeasonId
      ? seasons.some((s) => s.Id === selectedSeasonId)
      : false

    if (!hasSelected) {
      setSelectedSeasonId(findDefaultSeasonId())
    }
  }, [seasons, selectedSeasonId, findDefaultSeasonId])

  if (seasons.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4">
        <EmptyState
          icon={<AlertCircle className="size-14" />}
          message={t('series.noSeasons')}
        />
      </div>
    )
  }

  return (
    <div className="max-w-3xl md:max-w-4xl lg:max-w-5xl mx-auto">
      <SeasonTabs
        seasons={seasons}
        selectedSeasonId={selectedSeasonId}
        onSeasonSelect={setSelectedSeasonId}
        vibrantColors={vibrantColors}
      />

      <div className="mt-2 md:mt-4">
        {selectedSeason && series.Id && (
          <SeasonEpisodes
            key={selectedSeason.Id}
            seriesId={series.Id}
            season={selectedSeason}
            vibrantColors={vibrantColors}
          />
        )}
      </div>
    </div>
  )
}

export default SeriesView
