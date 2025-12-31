/**
 * Series route - Displays series seasons and episodes.
 * Renders the SeriesView component for a specific series.
 * Requirements: 2.5, 7.1
 */

import { createFileRoute } from '@tanstack/react-router'

import { useQuery } from '@tanstack/react-query'
import type { BaseItemDto } from '@/types/jellyfin'
import { SeriesView } from '@/components/views/SeriesView'
import { itemsKeys, useItem } from '@/hooks/queries/use-items'
import { Skeleton } from '@/components/ui/skeleton'
import { getEpisodes, getItemById, getSeasons } from '@/services/items/api'
import { useApiStore } from '@/stores/api-store'

/**
 * Query key factory for series-related queries.
 */
export const seriesKeys = {
  all: ['series'] as const,
  seasons: (seriesId: string) =>
    [...seriesKeys.all, 'seasons', seriesId] as const,
  episodes: (seriesId: string, seasonId: string) =>
    [...seriesKeys.all, 'episodes', seriesId, seasonId] as const,
}

/**
 * Loading skeleton for the series page.
 */
function SeriesSkeleton() {
  return (
    <main className="h-[calc(100vh-3.5rem)] p-6 overflow-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back button and title skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-8 w-48" />
        </div>
        {/* Season accordions skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      </div>
    </main>
  )
}

export const Route = createFileRoute('/series/$itemId')({
  loader: async ({ params, context }) => {
    const { itemId } = params
    const { queryClient } = context

    // Prefetch series data
    await queryClient.ensureQueryData({
      queryKey: itemsKeys.detail(itemId),
      queryFn: () => getItemById(itemId),
      staleTime: 5 * 60 * 1000, // 5 minutes
    })

    // Prefetch seasons data
    await queryClient.ensureQueryData({
      queryKey: seriesKeys.seasons(itemId),
      queryFn: () => getSeasons(itemId),
      staleTime: 5 * 60 * 1000, // 5 minutes
    })
  },
  pendingComponent: SeriesSkeleton,
  component: SeriesPage,
})

/**
 * Hook to fetch seasons for a series.
 */
function useSeasons(seriesId: string) {
  const validConnection = useApiStore((state) => state.validConnection)

  return useQuery<Array<BaseItemDto>, Error>({
    queryKey: seriesKeys.seasons(seriesId),
    queryFn: () => getSeasons(seriesId),
    enabled: validConnection && !!seriesId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

function SeriesPage() {
  const { itemId } = Route.useParams()

  // Fetch series data using the hook (will use cached data from loader)
  const {
    data: series,
    isLoading: isLoadingSeries,
    error: seriesError,
  } = useItem(itemId)

  // Fetch seasons data
  const {
    data: seasons,
    isLoading: isLoadingSeasons,
    error: seasonsError,
  } = useSeasons(itemId)

  const isLoading = isLoadingSeries || isLoadingSeasons
  const error = seriesError || seasonsError

  if (isLoading) {
    return <SeriesSkeleton />
  }

  if (error || !series) {
    return (
      <main className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="text-destructive">
          {error?.message || 'Series not found'}
        </div>
      </main>
    )
  }

  if (!seasons || seasons.length === 0) {
    return (
      <main className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="text-muted-foreground">
          No seasons found for this series
        </div>
      </main>
    )
  }

  // Function to fetch episodes for a season
  const fetchEpisodes = async (
    seasonId: string,
  ): Promise<Array<BaseItemDto>> => {
    return getEpisodes(itemId, seasonId)
  }

  return (
    <main className="h-[calc(100vh-3.5rem)] p-6 overflow-auto">
      <SeriesView
        series={series}
        seasons={seasons}
        getEpisodes={fetchEpisodes}
      />
    </main>
  )
}
