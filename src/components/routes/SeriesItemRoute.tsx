import { Suspense, lazy } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'

import { itemsQueryOptions, seriesQueryOptions } from '@/services/items/queries'
import { getBestImageUrl } from '@/services/video/api'
import { useArtworkColor } from '@/hooks/use-artwork-color'
import { DynamicThemeScope } from '@/components/ui/dynamic-theme-scope'
import { Skeleton } from '@/components/ui/skeleton'
import { RouteErrorFallback } from '@/components/ui/route-error-fallback'
import { FeatureErrorBoundary } from '@/components/ui/feature-error-boundary'

const routeApi = getRouteApi('/series/$itemId')

const SeriesView = lazy(() =>
  import('@/components/views/SeriesView').then((module) => ({
    default: module.SeriesView,
  })),
)

export function SeriesSkeleton() {
  return (
    <div
      className="flex-1 px-4 py-6 sm:px-6"
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
            <Skeleton key={i} className="h-14 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  )
}

export function SeriesPage() {
  const { itemId } = routeApi.useParams()
  const { seasonId } = routeApi.useSearch()
  const navigate = useNavigate({ from: '/series/$itemId' })

  const { data: series } = useSuspenseQuery(itemsQueryOptions.detail(itemId))
  const { data: seasons } = useSuspenseQuery(seriesQueryOptions.seasons(itemId))

  const imageUrl = series ? getBestImageUrl(series, 300) : null
  const seedColor = useArtworkColor(imageUrl || null, {
    enabled: !!imageUrl,
  })

  const handleSeasonSelect = (id: string) => {
    void navigate({
      search: (prev) => ({ ...prev, seasonId: id }),
      replace: true,
    })
  }

  if (!series) {
    return <RouteErrorFallback message="Series not found" />
  }

  if (seasons.length === 0) {
    return (
      <RouteErrorFallback
        message="No seasons found for this series"
        showRetry={false}
      />
    )
  }

  return (
    <DynamicThemeScope
      seedColor={seedColor}
      className="relative z-10 flex flex-1 flex-col px-4 py-6 sm:px-6"
    >
      <FeatureErrorBoundary featureName="Series">
        <Suspense fallback={<SeriesSkeleton />}>
          <SeriesView
            series={series}
            seasons={seasons}
            selectedSeasonId={seasonId}
            onSeasonSelect={handleSeasonSelect}
          />
        </Suspense>
      </FeatureErrorBoundary>
    </DynamicThemeScope>
  )
}
