/**
 * SeriesView component for displaying series seasons and episodes.
 * Displays seasons as expandable accordion sections with episodes inside.
 * Requirements: 7.1, 7.2, 7.5
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  ChevronLeft,
  Loader2,
  Play,
  RefreshCw,
} from 'lucide-react'

import type { BaseItemDto } from '@/types/jellyfin'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { ItemImage } from '@/components/media/ItemImage'
import { cn } from '@/lib/utils'

export interface SeriesViewProps {
  /** The series item */
  series: BaseItemDto
  /** Array of seasons for the series */
  seasons: Array<BaseItemDto>
  /** Function to fetch episodes for a season */
  getEpisodes: (seasonId: string) => Promise<Array<BaseItemDto>>
}

interface SeasonEpisodesProps {
  /** The season item */
  season: BaseItemDto
  /** Function to fetch episodes */
  getEpisodes: (seasonId: string) => Promise<Array<BaseItemDto>>
}

/** Episode loading state */
interface EpisodeState {
  episodes: Array<BaseItemDto>
  isLoading: boolean
  error: string | null
  hasLoaded: boolean
}

/**
 * Component to display episodes within a season.
 * Fetches episodes when the season accordion is expanded.
 */
function SeasonEpisodes({ season, getEpisodes }: SeasonEpisodesProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const abortControllerRef = useRef<AbortController | null>(null)
  const [state, setState] = useState<EpisodeState>({
    episodes: [],
    isLoading: true,
    error: null,
    hasLoaded: false,
  })

  const loadEpisodes = useCallback(async () => {
    if (state.hasLoaded) return

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    setState((prev) => ({ ...prev, isLoading: true, error: null }))

    try {
      const seasonId = season.Id ?? ''
      const episodeData = await getEpisodes(seasonId)
      setState({
        episodes: episodeData,
        isLoading: false,
        error: null,
        hasLoaded: true,
      })
    } catch (error) {
      // Don't update state if request was aborted
      if (error instanceof Error && error.name === 'AbortError') return

      console.error('Failed to load episodes:', error)
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: t('series.episodeLoadError'),
      }))
    }
  }, [season.Id, getEpisodes, state.hasLoaded, t])

  // Load episodes when component mounts
  useEffect(() => {
    loadEpisodes()

    return () => {
      // Cleanup: abort pending request on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [loadEpisodes])

  const handleRetry = () => {
    setState((prev) => ({ ...prev, hasLoaded: false }))
  }

  const handleEpisodeClick = (episode: BaseItemDto) => {
    navigate({
      to: '/player/$itemId',
      params: { itemId: episode.Id ?? '' },
      search: { fetchSegments: 'true' },
    })
  }

  if (state.isLoading) {
    return (
      <div className="py-6 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span>
          {t('series.loadingEpisodes', {
            season: season.Name ?? season.IndexNumber,
          })}
        </span>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="py-6 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <AlertCircle className="size-8 text-destructive" />
        <p className="text-sm">{state.error}</p>
        <Button variant="outline" size="sm" onClick={handleRetry}>
          <RefreshCw className="size-4 mr-2" />
          {t('common.retry')}
        </Button>
      </div>
    )
  }

  if (state.episodes.length === 0) {
    return (
      <div className="py-6 text-center text-muted-foreground">
        {t('series.noEpisodes')}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {state.episodes.map((episode) => (
        <EpisodeRow
          key={episode.Id}
          episode={episode}
          onClick={() => handleEpisodeClick(episode)}
        />
      ))}
    </div>
  )
}

interface EpisodeRowProps {
  episode: BaseItemDto
  onClick: () => void
}

/**
 * Single episode row with thumbnail, episode info, and play button.
 */
function EpisodeRow({ episode, onClick }: EpisodeRowProps) {
  const episodeNumber = episode.IndexNumber
  const seasonNumber = episode.ParentIndexNumber
  const episodeName = episode.Name

  // Format episode label (e.g., "S1E5 - Episode Name")
  const episodeLabel = `S${seasonNumber ?? '?'}E${episodeNumber ?? '?'}`
  const showName = episodeName && !episodeName.toLowerCase().includes('episode')

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className={cn(
        'flex items-center gap-4 p-2 rounded-lg',
        'cursor-pointer transition-colors',
        'hover:bg-accent/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      {/* Episode Thumbnail */}
      <div className="flex-shrink-0 w-[124px] h-[70px] rounded overflow-hidden bg-muted">
        <ItemImage
          item={episode}
          maxWidth={124}
          aspectRatio="aspect-video"
          className="w-full h-full object-cover"
        />
      </div>

      {/* Episode Info */}
      <div className="flex-grow min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{episodeLabel}</span>
          {showName && (
            <span className="text-sm text-muted-foreground truncate">
              - {episodeName}
            </span>
          )}
        </div>
        {episode.RunTimeTicks && (
          <p className="text-xs text-muted-foreground mt-1">
            {Math.round(episode.RunTimeTicks / 600000000)} min
          </p>
        )}
      </div>

      {/* Play Button */}
      <Button
        variant="ghost"
        size="icon"
        className="flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
      >
        <Play className="h-4 w-4" />
        <span className="sr-only">Play episode</span>
      </Button>
    </div>
  )
}

/**
 * SeriesView displays a series with expandable season sections.
 * Each season can be expanded to show its episodes.
 */
export function SeriesView({ series, seasons, getEpisodes }: SeriesViewProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [expandedSeasons, setExpandedSeasons] = useState<Array<string>>(
    seasons[0]?.Id ? [seasons[0].Id] : [],
  )

  const seriesName =
    series.Name ?? seasons[0]?.SeriesName ?? t('series.unknownSeries')

  const handleBack = () => {
    navigate({ to: '/' })
  }

  // Empty state for series with no seasons
  if (seasons.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={handleBack}
            className="rounded-full"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="sr-only">{t('common.goBack')}</span>
          </Button>
          <h1 className="text-xl font-semibold">{seriesName}</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <AlertCircle className="size-12 mb-4 opacity-50" />
          <p>{t('series.noSeasons')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with back button and series name */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={handleBack}
          className="rounded-full"
        >
          <ChevronLeft className="h-5 w-5" />
          <span className="sr-only">{t('common.goBack')}</span>
        </Button>
        <h1 className="text-xl font-semibold">{seriesName}</h1>
      </div>

      {/* Seasons Accordion */}
      <Accordion
        value={expandedSeasons}
        onValueChange={setExpandedSeasons}
        multiple
        className="space-y-2"
      >
        {seasons.map((season) => (
          <AccordionItem
            key={season.Id}
            value={season.Id ?? ''}
            className="border rounded-lg px-4"
          >
            <AccordionTrigger className="hover:no-underline">
              <span className="font-medium">
                {season.Name ??
                  t('series.seasonNumber', { number: season.IndexNumber })}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <SeasonEpisodes season={season} getEpisodes={getEpisodes} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}

export default SeriesView
