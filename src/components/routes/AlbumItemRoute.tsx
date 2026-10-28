import { Suspense, lazy } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'

import { albumQueryOptions, itemsQueryOptions } from '@/services/items/queries'
import { useQueryIdentity } from '@/hooks/queries/query-identity'
import { getBestImageUrl } from '@/services/video/api'
import { useArtworkColor } from '@/hooks/use-artwork-color'
import { DynamicThemeScope } from '@/components/ui/dynamic-theme-scope'
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
      className="flex-1 px-fluid-md py-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading album</span>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-col sm:flex-row gap-fluid-md">
          <Skeleton className="shrink-0 size-(--spacing-thumbnail-sm) sm:size-(--spacing-thumbnail-md) rounded-2xl mx-auto sm:mx-0" />
          <div className="flex flex-col justify-end items-center sm:items-start gap-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="flex flex-col gap-2 md:gap-3">
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
  const identity = useQueryIdentity()

  const { data: album } = useSuspenseQuery(
    itemsQueryOptions.detail(identity, itemId),
  )
  const { data: tracks } = useSuspenseQuery(
    albumQueryOptions.tracks(identity, itemId),
  )

  const imageUrl = album ? getBestImageUrl(album, 300) : null
  const seedColor = useArtworkColor(imageUrl || null, {
    enabled: !!imageUrl,
  })

  if (!album) {
    return <RouteErrorFallback message="Album not found" />
  }

  return (
    <DynamicThemeScope
      seedColor={seedColor}
      className="relative flex flex-1 flex-col px-fluid-md py-6"
    >
      <FeatureErrorBoundary featureName="Album">
        <Suspense fallback={<AlbumSkeleton />}>
          <AlbumView album={album} tracks={tracks} />
        </Suspense>
      </FeatureErrorBoundary>
    </DynamicThemeScope>
  )
}
