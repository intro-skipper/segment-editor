import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Play } from 'lucide-react'

import type { BaseItemDto } from '@/types/jellyfin'
import { useEpisodes } from '@/services/items/queries'
import { useSegments } from '@/services/segments/queries'
import { useInView } from '@/hooks/use-in-view'
import { ItemImage } from '@/components/media/ItemImage'
import { SegmentTimeline } from '@/components/segment/SegmentTimeline'
import { InteractiveCard } from '@/components/ui/interactive-card'
import { LoadingState } from '@/components/ui/async-state'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { cn } from '@/lib/utils'
import { ticksToSeconds } from '@/lib/time-utils'
import { staggerDelay, STAGGER_NORMAL } from '@/lib/animation-utils'

interface SeriesViewProps {
  series: BaseItemDto
  seasons: Array<BaseItemDto>
  selectedSeasonId?: string | null
  onSeasonSelect: (seasonId: string) => void
}

interface SeasonTabsProps {
  seasons: Array<BaseItemDto>
  selectedSeasonId: string | null
  onSeasonSelect: (seasonId: string) => void
}

const isSpecialSeason = (s: BaseItemDto) =>
  s.IndexNumber === 0 || (s.Name || '').toLowerCase().includes('special')

const SeasonTabs = function SeasonTabsComponent({
  seasons,
  selectedSeasonId,
  onSeasonSelect,
}: SeasonTabsProps) {
  const orderedSeasons = (() => {
    const normal: typeof seasons = []
    const specials: typeof seasons = []
    for (const s of seasons) {
      if (isSpecialSeason(s)) specials.push(s)
      else normal.push(s)
    }
    return [...normal, ...specials]
  })()

  return (
    <div
      className="flex gap-2 md:gap-3 overflow-x-auto pb-2 md:pb-3 scrollbar-hide relative z-10"
      role="tablist"
      aria-label="Seasons"
    >
      {orderedSeasons.map((season, index) => {
        const isSelected = season.Id === selectedSeasonId
        const label = season.Name ?? `Season ${season.IndexNumber ?? index + 1}`

        return (
          <button
            type="button"
            key={season.Id}
            role="tab"
            aria-selected={isSelected}
            aria-controls={`season-panel-${season.Id}`}
            onClick={() => season.Id && onSeasonSelect(season.Id)}
            className={cn(
              'flex-shrink-0 px-4 py-3 md:px-6 md:py-4 rounded-full text-base md:text-lg font-semibold whitespace-nowrap',
              'transition-[background-color,color,border-color,box-shadow] duration-200 ease-out border-2 border-transparent',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isSelected
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

interface EpisodeSegmentTimelineProps {
  episodeId: string
  runtimeSeconds: number
}

/**
 * Prefetch margin for per-episode segment queries. Rows within this distance
 * of the viewport start fetching, so bars are ready as the user scrolls
 * while off-screen rows of large seasons don't fire requests on mount.
 */
const SEGMENT_PREFETCH_ROOT_MARGIN = '600px 0px'

function EpisodeSegmentTimeline({
  episodeId,
  runtimeSeconds,
}: EpisodeSegmentTimelineProps) {
  const { ref, inView } = useInView<HTMLDivElement>({
    rootMargin: SEGMENT_PREFETCH_ROOT_MARGIN,
  })
  const {
    data: segments,
    isPending,
    isError,
  } = useSegments(episodeId, { enabled: inView })

  // Keep the observer target mounted for cached errors so entering the
  // viewport can re-enable the query and retry it.
  if (!episodeId) return null

  return (
    <div ref={ref} className="mt-2 md:mt-2.5">
      {!isError && (
        <SegmentTimeline
          segments={segments ?? []}
          runtimeSeconds={runtimeSeconds}
          isLoading={isPending}
        />
      )}
    </div>
  )
}

interface EpisodeCardProps {
  episode: BaseItemDto
  episodeId: string
  index: number
  onEpisodeClick: (episodeId: string) => void
}

const EpisodeCard = function EpisodeCardComponent({
  episode,
  episodeId,
  index,
  onEpisodeClick,
}: EpisodeCardProps) {
  const { t } = useTranslation()

  const episodeLabel = `S${episode.ParentIndexNumber ?? '?'}E${episode.IndexNumber ?? '?'}`
  const runtime = episode.RunTimeTicks
    ? Math.round(episode.RunTimeTicks / 600_000_000)
    : null
  const animationDelay = staggerDelay(index, STAGGER_NORMAL, 400)

  const episodeName = episode.Name || episodeLabel
  const ariaLabel = runtime
    ? `${episodeLabel}: ${episodeName}, ${runtime} minutes`
    : `${episodeLabel}: ${episodeName}`
  const selectEpisode = () => {
    onEpisodeClick(episodeId)
  }

  return (
    <InteractiveCard
      onClick={selectEpisode}
      animate
      animationDelay={animationDelay}
      className={cn(
        'group flex items-center gap-4 p-3 md:p-4 rounded-xl bg-card/60 backdrop-blur-sm border border-border/50',
        'hover:shadow-lg hover:shadow-black/10',
      )}
      aria-label={ariaLabel}
    >
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

      <div className="flex-grow min-w-0 py-0.5 md:py-1">
        <p className="font-semibold truncate leading-tight text-base md:text-lg text-foreground">
          {episode.Name || episodeLabel}
        </p>
        <p className="text-sm md:text-base truncate mt-0.5 md:mt-1 text-muted-foreground">
          {episode.Name ? episodeLabel : t('series.episode')}
          {runtime && ` · ${runtime} min`}
        </p>
        <EpisodeSegmentTimeline
          episodeId={episodeId}
          runtimeSeconds={ticksToSeconds(episode.RunTimeTicks)}
        />
      </div>
    </InteractiveCard>
  )
}

interface SeasonEpisodesProps {
  seriesId: string
  season: BaseItemDto
}

function SeasonEpisodes({ seriesId, season }: SeasonEpisodesProps) {
  const { t } = useTranslation()
  const navigate = useNavigate({ from: '/series/$itemId' })

  const {
    data: episodes = [],
    isLoading,
    error,
    refetch,
  } = useEpisodes(seriesId, season.Id ?? '', { enabled: !!season.Id })

  const handleEpisodeClick = (episodeId: string) => {
    void navigate({
      to: '/player/$itemId',
      params: { itemId: episodeId },
      search: { fetchSegments: 'true' },
    })
  }

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

  return (
    <div
      className="space-y-2 md:space-y-3"
      role="tabpanel"
      id={`season-panel-${season.Id}`}
    >
      {episodes.map((episode, index) => (
        <div
          key={episode.Id}
          style={{
            contentVisibility: 'auto',
            containIntrinsicSize: '0 120px',
          }}
        >
          <EpisodeCard
            episode={episode}
            episodeId={episode.Id ?? ''}
            index={index}
            onEpisodeClick={handleEpisodeClick}
          />
        </div>
      ))}
    </div>
  )
}

export function SeriesView({
  series,
  seasons,
  selectedSeasonId: selectedSeasonIdProp,
  onSeasonSelect,
}: SeriesViewProps) {
  const { t } = useTranslation()

  const findDefaultSeasonId = () => {
    const firstNonSpecial = seasons.find((s) => !isSpecialSeason(s))
    return firstNonSpecial?.Id ?? seasons[0]?.Id ?? null
  }

  const resolvedSelectedSeasonId = (() => {
    if (seasons.length === 0) {
      return null
    }

    const hasSelected = selectedSeasonIdProp
      ? seasons.some((s) => s.Id === selectedSeasonIdProp)
      : false

    return hasSelected ? (selectedSeasonIdProp ?? null) : findDefaultSeasonId()
  })()

  const selectedSeason = seasons.find((s) => s.Id === resolvedSelectedSeasonId)

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
    <div className="max-w-3xl md:max-w-4xl lg:max-w-5xl mx-auto relative z-10">
      <SeasonTabs
        seasons={seasons}
        selectedSeasonId={resolvedSelectedSeasonId}
        onSeasonSelect={onSeasonSelect}
      />

      <div className="mt-2 md:mt-4">
        {selectedSeason && series.Id && (
          <SeasonEpisodes
            key={selectedSeason.Id}
            seriesId={series.Id}
            season={selectedSeason}
          />
        )}
      </div>
    </div>
  )
}
