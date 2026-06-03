import { Suspense, lazy } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'

import { itemsQueryOptions, seriesQueryOptions } from '@/services/items/queries'
import { getBestImageUrl } from '@/services/video/api'
import { useVibrantColor } from '@/hooks/use-vibrant-color'
import { Skeleton } from '@/components/ui/skeleton'
import { RouteErrorFallback } from '@/components/ui/route-error-fallback'
import { FeatureErrorBoundary } from '@/components/ui/feature-error-boundary'
import { staggerDelay, STAGGER_SLOW } from '@/lib/animation-utils'

const routeApi = getRouteApi('/series/$itemId')

const SeriesView = lazy(() =>
  import('@/components/views/SeriesView').then((module) => ({
    default: module.SeriesView,
  })),
)

export function SeriesSkeleton() {
  return (
    <main
      className="h-[var(--spacing-page-min-height-skeleton)] px-4 py-6 sm:px-6 overflow-auto"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading series</span>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-14 w-full rounded-lg animate-in fade-in duration-300"
              style={{ animationDelay: staggerDelay(i, STAGGER_SLOW) }}
            />
          ))}
        </div>
      </div>
    </main>
  )
}

export function SeriesPage() {
  const { itemId } = routeApi.useParams()
  const { seasonId } = routeApi.useSearch()
  const navigate = useNavigate({ from: '/series/$itemId' })

  const { data: series } = useSuspenseQuery(itemsQueryOptions.detail(itemId))
  const { data: seasons } = useSuspenseQuery(seriesQueryOptions.seasons(itemId))

  const imageUrl = series ? getBestImageUrl(series, 300) : null
  const vibrantColors = useVibrantColor(imageUrl || null, {
    enabled: !!imageUrl,
  })

  const handleSeasonSelect = (id: string) => {
    void navigate({
      search: (prev) => ({ ...prev, seasonId: id }),
      replace: true,
    })
  }

  if (!series) {
    return (
      <RouteErrorFallback
        message="Series not found"
        minHeightClass="min-h-[var(--spacing-page-min-height-header)]"
      />
    )
  }

  if (seasons.length === 0) {
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
      {vibrantColors && (
        <div
          className="fixed inset-0 z-0 transition-colors duration-700"
          style={{ backgroundColor: vibrantColors.background }}
        />
      )}
      <main className="min-h-[var(--spacing-page-min-height-header)] px-4 py-6 sm:px-6 overflow-auto relative z-10">
        <FeatureErrorBoundary
          featureName="Series"
          minHeightClass="min-h-[var(--spacing-page-min-height-header)]"
        >
          <Suspense fallback={<SeriesSkeleton />}>
            <SeriesView
              series={series}
              seasons={seasons}
              selectedSeasonId={seasonId}
              onSeasonSelect={handleSeasonSelect}
              vibrantColors={vibrantColors}
            />
          </Suspense>
        </FeatureErrorBoundary>
      </main>
    </>
  )
}
