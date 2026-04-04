/**
 * SeriesView - Displays series seasons and episodes.
 * Features pill tabs for seasons and clean card list for episodes.
 */

import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Loader2, Play, Share2 } from 'lucide-react'

import type { BaseItemDto, MediaSegmentDto } from '@/types/jellyfin'
import { getProviderIds } from '@/types/jellyfin'
import type { VibrantColors } from '@/hooks/use-vibrant-color'
import { useEpisodes } from '@/hooks/queries/use-items'
import { useVibrantTabStyle } from '@/hooks/use-vibrant-button-style'
import { ItemImage } from '@/components/media/ItemImage'
import { InteractiveCard } from '@/components/ui/interactive-card'
import { Button } from '@/components/ui/button'
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/ui/async-state'
import { mapWithLimit } from '@/lib/async-utils'
import { cn } from '@/lib/utils'
import { getAxiosMessageKey } from '@/lib/error-utils'
import { showNotification } from '@/lib/notifications'
import { getEpisodes } from '@/services/items/api'
import { getSegmentsById } from '@/services/segments/api'
import {
  submitCollectionToSkipMe,
  toSkipMeSegmentType,
  parseProviderId,
  runTimeTicksToMs,
  convertAndValidateSegmentTiming,
} from '@/services/skipme/api'
import type { SkipMeSubmitRequest } from '@/services/skipme/api'

interface SeriesViewProps {
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

const SeasonTabs = React.memo(function SeasonTabsComponent({
  seasons,
  selectedSeasonId,
  onSeasonSelect,
  vibrantColors,
}: SeasonTabsProps) {
  const { getTabStyle, hasColors } = useVibrantTabStyle(vibrantColors ?? null)

  // Memoize sorted seasons - specials always last, single pass
  const orderedSeasons = React.useMemo(() => {
    const normal: typeof seasons = []
    const specials: typeof seasons = []
    for (const s of seasons) {
      if (isSpecialSeason(s)) specials.push(s)
      else normal.push(s)
    }
    return [...normal, ...specials]
  }, [seasons])

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
            key={season.Id}
            role="tab"
            aria-selected={isSelected}
            aria-controls={`season-panel-${season.Id}`}
            onClick={() => season.Id && onSeasonSelect(season.Id)}
            className={cn(
              'flex-shrink-0 px-4 py-3 md:px-6 md:py-4 rounded-full text-base md:text-lg font-semibold whitespace-nowrap',
              'transition-[background-color,color,border-color,box-shadow] duration-200 ease-out border-2',
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
  episodeId: string
  index: number
  onEpisodeClick: (episodeId: string) => void
  vibrantColors?: VibrantColors | null
}

const EpisodeCard = React.memo(function EpisodeCardComponent({
  episode,
  episodeId,
  index,
  onEpisodeClick,
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
  const handleClick = React.useCallback(() => {
    onEpisodeClick(episodeId)
  }, [onEpisodeClick, episodeId])

  return (
    <InteractiveCard
      onClick={handleClick}
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
      void navigate({
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
            vibrantColors={vibrantColors}
          />
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SubmitAllButton helpers
// ─────────────────────────────────────────────────────────────────────────────

interface EpisodeEntry {
  episode: BaseItemDto
  season: BaseItemDto
}

/** Maximum number of concurrent API requests to Jellyfin when fetching episode/segment data. */
const MAX_CONCURRENCY = 6

/** Fetch all episodes for every valid season, then all their segments, with bounded concurrency. */
async function fetchSeriesEpisodeData(
  seriesId: string,
  validSeasons: Array<BaseItemDto>,
): Promise<{
  episodeEntries: Array<EpisodeEntry>
  segmentsPerEpisode: Array<Array<MediaSegmentDto>>
}> {
  const episodesPerSeason = await mapWithLimit(
    validSeasons,
    MAX_CONCURRENCY,
    (season) => getEpisodes(seriesId, season.Id!),
  )
  const episodeEntries = episodesPerSeason.flatMap((episodes, i) =>
    episodes
      .filter((e) => !!e.Id)
      .map((episode) => ({ episode, season: validSeasons[i] })),
  )
  const segmentsPerEpisode = await mapWithLimit(
    episodeEntries,
    MAX_CONCURRENCY,
    ({ episode }) => getSegmentsById(episode.Id!),
  )
  return { episodeEntries, segmentsPerEpisode }
}

/** Build the list of SkipMe submit requests from fetched episode/segment data. */
function buildSubmitRequests(
  seriesTmdbId: number | undefined,
  seriesTvdbId: number | undefined,
  seriesAniListId: number | undefined,
  episodeEntries: Array<EpisodeEntry>,
  segmentsPerEpisode: Array<Array<MediaSegmentDto>>,
): Array<SkipMeSubmitRequest> {
  const requests: Array<SkipMeSubmitRequest> = []

  for (const [i, { episode, season }] of episodeEntries.entries()) {
    const segments = segmentsPerEpisode[i] ?? []

    const seasonProviderIds = getProviderIds(season)
    const tvdbSeasonId = parseProviderId(seasonProviderIds?.Tvdb)

    const episodeProviderIds = getProviderIds(episode)
    const episodeTvdbId = parseProviderId(episodeProviderIds?.Tvdb)

    if (
      seriesTmdbId === undefined &&
      episodeTvdbId === undefined &&
      seriesAniListId === undefined
    ) {
      continue
    }

    const durationMs = runTimeTicksToMs(episode.RunTimeTicks)
    if (!durationMs) continue

    for (const segment of segments) {
      const skipMeType = toSkipMeSegmentType(segment.Type)
      if (!skipMeType) continue

      const timing = convertAndValidateSegmentTiming(
        segment.StartTicks,
        segment.EndTicks,
        durationMs,
      )
      if (!timing.valid) continue

      requests.push({
        tmdb_id: seriesTmdbId,
        tvdb_id: episodeTvdbId,
        anilist_id: seriesAniListId,
        tvdb_series_id: seriesTvdbId,
        tvdb_season_id: tvdbSeasonId,
        segment: skipMeType,
        season: episode.ParentIndexNumber ?? undefined,
        episode: episode.IndexNumber ?? undefined,
        duration_ms: durationMs,
        start_ms: timing.startMs,
        end_ms: timing.endMs,
      })
    }
  }

  return requests
}

// ─────────────────────────────────────────────────────────────────────────────
// SubmitAllButton - Submits all series segments to SkipMe.db
// ─────────────────────────────────────────────────────────────────────────────

/** Show the appropriate notification after a collection submission. */
function notifyCollectionResult(
  result: { ok: boolean; submitted?: number },
  totalCount: number,
  t: (key: string, opts?: Record<string, unknown>) => string,
): void {
  if (!result.ok) {
    showNotification({
      type: 'negative',
      message: t('series.submitAllFailed'),
    })
    return
  }
  const submitted = result.submitted
  if (submitted !== undefined && submitted < totalCount) {
    showNotification({
      type: 'warning',
      message: t('series.submitAllPartial', {
        submitted,
        count: totalCount,
      }),
    })
    return
  }
  showNotification({
    type: 'positive',
    message: t('series.submitAllSuccess', { count: totalCount }),
  })
}

interface SubmitAllButtonProps {
  series: BaseItemDto
  seasons: Array<BaseItemDto>
}

function SubmitAllButton({ series, seasons }: SubmitAllButtonProps) {
  const { t } = useTranslation()
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const handleSubmitAll = React.useCallback(async () => {
    if (!series.Id) return
    setIsSubmitting(true)

    // Hoist value-block expressions out of try/catch for React Compiler
    const seriesProviderIds = getProviderIds(series)
    const seriesTmdbId = parseProviderId(seriesProviderIds?.Tmdb)
    const seriesTvdbId = parseProviderId(seriesProviderIds?.Tvdb)
    const seriesAniListId = parseProviderId(seriesProviderIds?.AniList)
    const validSeasons = seasons.filter((s) => !!s.Id && !isSpecialSeason(s))

    try {
      const { episodeEntries, segmentsPerEpisode } =
        await fetchSeriesEpisodeData(series.Id, validSeasons)

      const requests = buildSubmitRequests(
        seriesTmdbId,
        seriesTvdbId,
        seriesAniListId,
        episodeEntries,
        segmentsPerEpisode,
      )

      if (requests.length === 0) {
        showNotification({
          type: 'warning',
          message: t('series.submitAllNone'),
        })
        setIsSubmitting(false)
        return
      }

      const result = await submitCollectionToSkipMe(requests)
      notifyCollectionResult(result, requests.length, t)
    } catch (e) {
      const messageKey = getAxiosMessageKey(e, {
        defaultKey: 'series.submitAllFailed',
        forbiddenKey: 'series.submitAllClientNotSupported',
      })
      showNotification({
        type: 'negative',
        message: t(messageKey),
      })
    }
    setIsSubmitting(false)
  }, [series, seasons, t])

  return (
    <Button
      variant="outline"
      onClick={handleSubmitAll}
      disabled={isSubmitting}
      aria-busy={isSubmitting}
    >
      {isSubmitting ? (
        <Loader2 className="animate-spin" aria-hidden="true" />
      ) : (
        <Share2 aria-hidden="true" />
      )}
      {t('series.submitAll')}
    </Button>
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

  const resolvedSelectedSeasonId = React.useMemo(() => {
    if (seasons.length === 0) {
      return null
    }

    const hasSelected = selectedSeasonId
      ? seasons.some((s) => s.Id === selectedSeasonId)
      : false

    return hasSelected ? selectedSeasonId : findDefaultSeasonId()
  }, [seasons, selectedSeasonId, findDefaultSeasonId])

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

      {series.Id && (
        <div className="mt-6 md:mt-8 flex justify-center">
          <SubmitAllButton series={series} seasons={seasons} />
        </div>
      )}
    </div>
  )
}
