/**
 * Series route - Displays series seasons and episodes.
 * Renders the SeriesView component for a specific series.
 */

import { useEffect } from 'react'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { z } from 'zod'

import { SeriesView } from '@/components/views/SeriesView'
import {
  QUERY_STALE_TIMES,
  itemsKeys,
  seriesKeys,
  useItem,
  useSeasons,
} from '@/hooks/queries'
import { Skeleton } from '@/components/ui/skeleton'
import { LightRays } from '@/components/ui/light-rays'
import { RouteErrorFallback } from '@/components/ui/route-error-fallback'
import { FeatureErrorBoundary } from '@/components/ui/feature-error-boundary'
import { getItemById, getSeasons } from '@/services/items/api'
import { getBestImageUrl } from '@/services/video/api'
import { useVibrantColor } from '@/hooks/use-vibrant-color'
import { useSessionStore } from '@/stores/session-store'

/**
 * Route params schema - validates itemId is a valid Jellyfin ID.
 * Accepts both standard UUID format and Jellyfin's 32-char hex format.
 * Security: Prevents injection attacks via malformed IDs.
 */
const jellyfinIdSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i,
    'Invalid series ID format',
  )

const seriesParamsSchema = z.object({
  itemId: jellyfinIdSchema,
})

/**
 * Loading skeleton for the series page.
 * Uses consistent height variables and ARIA attributes.
 */
function SeriesSkeleton() {
  return (
    <main
      className="h-[var(--spacing-page-min-height-skeleton)] px-4 py-6 sm:px-6 overflow-auto"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading series</span>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back button and title skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-8 w-48" />
        </div>
        {/* Season accordions skeleton */}
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-14 w-full rounded-lg animate-in fade-in duration-300"
              style={{ animationDelay: `${i * 50}ms` }}
            />
          ))}
        </div>
      </div>
    </main>
  )
}

export const Route = createFileRoute('/series/$itemId')({
  params: {
    parse: (params) => seriesParamsSchema.parse(params),
    stringify: (params) => params,
  },
  loader: async ({ params, context }) => {
    const { itemId } = params
    const { queryClient } = context

    // Prefetch series data
    await queryClient.ensureQueryData({
      queryKey: itemsKeys.detail(itemId),
      queryFn: () => getItemById(itemId),
      staleTime: QUERY_STALE_TIMES.LONG,
    })

    // Prefetch seasons data
    await queryClient.ensureQueryData({
      queryKey: seriesKeys.seasons(itemId),
      queryFn: () => getSeasons(itemId),
      staleTime: QUERY_STALE_TIMES.LONG,
    })
  },
  onError: () => {
    // Throw notFound for invalid params (e.g., malformed UUID)
    throw notFound()
  },
  pendingComponent: SeriesSkeleton,
  component: SeriesPage,
})

function SeriesPage() {
  const { itemId } = Route.useParams()
  const setVibrantColors = useSessionStore((s) => s.setVibrantColors)

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

  // Extract vibrant color from series poster
  const imageUrl = series ? getBestImageUrl(series, 300) : null
  const vibrantColors = useVibrantColor(imageUrl || null)

  // Sync vibrant colors to session store for header - must be called unconditionally
  useEffect(() => {
    setVibrantColors(vibrantColors)
    return () => setVibrantColors(null)
  }, [vibrantColors, setVibrantColors])

  const isLoading = isLoadingSeries || isLoadingSeasons
  const error = seriesError || seasonsError

  if (isLoading) {
    return <SeriesSkeleton />
  }

  if (error || !series) {
    return (
      <RouteErrorFallback
        message={error?.message || 'Series not found'}
        minHeightClass="min-h-[var(--spacing-page-min-height-header)]"
      />
    )
  }

  if (!seasons || seasons.length === 0) {
    return (
      <RouteErrorFallback
        message="No seasons found for this series"
        showRetry={false}
        minHeightClass="min-h-[var(--spacing-page-min-height-header)]"
      />
    )
  }

  return (
    <>
      {/* Full-screen background that extends behind header */}
      {vibrantColors && (
        <>
          <div
            className="fixed inset-0 z-0 transition-colors duration-700"
            style={{ backgroundColor: vibrantColors.background }}
          />
          <LightRays
            className="fixed inset-0 z-0"
            count={5}
            color={vibrantColors.primary}
            blur={48}
            speed={18}
            length="60vh"
          />
        </>
      )}
      <main className="min-h-[var(--spacing-page-min-height-header)] px-4 py-6 sm:px-6 overflow-auto">
        <FeatureErrorBoundary
          featureName="Series"
          minHeightClass="min-h-[var(--spacing-page-min-height-header)]"
        >
          <SeriesView
            series={series}
            seasons={seasons}
            vibrantColors={vibrantColors}
          />
        </FeatureErrorBoundary>
      </main>
    </>
  )
}
