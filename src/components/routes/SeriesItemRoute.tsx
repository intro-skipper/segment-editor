import { Suspense, lazy } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'

import { itemsQueryOptions, seriesQueryOptions } from '@/services/items/queries'
import { useQueryIdentity } from '@/hooks/queries/query-identity'
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
      className="flex-1 px-fluid-md py-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading series</span>
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex gap-2 md:gap-3 pbe-2 md:pbe-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-24 rounded-full" />
          ))}
        </div>
        <div className="flex flex-col gap-2 md:gap-3 mbs-2 md:mbs-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  )
}

export function SeriesPage() {
  const { itemId } = routeApi.useParams()
  const identity = useQueryIdentity()
  const { seasonId } = routeApi.useSearch()
  const navigate = useNavigate({ from: '/series/$itemId' })

  const { data: series } = useSuspenseQuery(
    itemsQueryOptions.detail(identity, itemId),
  )
  const { data: seasons } = useSuspenseQuery(
    seriesQueryOptions.seasons(identity, itemId),
  )

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
      className="relative z-10 flex flex-1 flex-col px-fluid-md py-6"
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
