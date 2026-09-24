import { Suspense, lazy } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'

import { albumQueryOptions, itemsQueryOptions } from '@/services/items/queries'
import { Skeleton } from '@/components/ui/skeleton'
import { RouteErrorFallback } from '@/components/ui/route-error-fallback'
import { FeatureErrorBoundary } from '@/components/ui/feature-error-boundary'

const routeApi = getRouteApi('/album/$itemId')

const AlbumView = lazy(() =>
  import('@/components/views/AlbumView').then((module) => ({
    default: module.AlbumView,
  })),
)

export function AlbumSkeleton() {
  return (
    <div
      className="flex-1 px-4 py-6 sm:px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading album</span>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="flex gap-6">
          <Skeleton className="size-32 rounded-lg shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="space-y-2 md:space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  )
}

export function AlbumPage() {
  const { itemId } = routeApi.useParams()

  const { data: album } = useSuspenseQuery(itemsQueryOptions.detail(itemId))
  const { data: tracks } = useSuspenseQuery(albumQueryOptions.tracks(itemId))

  if (!album) {
    return <RouteErrorFallback message="Album not found" />
  }

  return (
    <div className="flex flex-1 flex-col px-4 py-6 sm:px-6">
      <FeatureErrorBoundary featureName="Album">
        <Suspense fallback={<AlbumSkeleton />}>
          <AlbumView album={album} tracks={tracks} />
        </Suspense>
      </FeatureErrorBoundary>
    </div>
  )
}
