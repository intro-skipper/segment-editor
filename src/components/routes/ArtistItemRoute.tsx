import { Suspense, lazy } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'

import { artistQueryOptions, itemsQueryOptions } from '@/services/items/queries'
import { Skeleton } from '@/components/ui/skeleton'
import { RouteErrorFallback } from '@/components/ui/route-error-fallback'
import { FeatureErrorBoundary } from '@/components/ui/feature-error-boundary'
import { staggerDelay } from '@/lib/animation-utils'

const routeApi = getRouteApi('/artist/$itemId')

const ArtistView = lazy(() =>
  import('@/components/views/ArtistView').then((module) => ({
    default: module.ArtistView,
  })),
)

export function ArtistSkeleton() {
  return (
    <div
      className="flex-1 px-4 py-6 sm:px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading artist</span>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="space-y-2 animate-in fade-in animation-duration-300"
              style={{ animationDelay: staggerDelay(i) }}
            >
              <Skeleton className="aspect-square w-full rounded-2xl" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ArtistPage() {
  const { itemId } = routeApi.useParams()

  const { data: artist } = useSuspenseQuery(itemsQueryOptions.detail(itemId))
  const { data: albums } = useSuspenseQuery(artistQueryOptions.albums(itemId))

  if (!artist) {
    return <RouteErrorFallback message="Artist not found" />
  }

  return (
    <div className="flex flex-1 flex-col px-4 py-6 sm:px-6">
      <FeatureErrorBoundary featureName="Artist">
        <Suspense fallback={<ArtistSkeleton />}>
          <ArtistView artist={artist} albums={albums} />
        </Suspense>
      </FeatureErrorBoundary>
    </div>
  )
}
