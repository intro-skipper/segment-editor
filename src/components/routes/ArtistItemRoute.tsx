import { Suspense, lazy } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'

import { artistQueryOptions, itemsQueryOptions } from '@/services/items/queries'
import { useQueryIdentity } from '@/hooks/queries/query-identity'
import { getBestImageUrl } from '@/services/video/api'
import { useArtworkColor } from '@/hooks/use-artwork-color'
import { DynamicThemeScope } from '@/components/ui/dynamic-theme-scope'
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
      className="flex-1 px-fluid-md py-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading artist</span>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="grid grid-cols-media gap-fluid-md">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 animate-in fade-in animation-duration-300"
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
  const identity = useQueryIdentity()

  const { data: artist } = useSuspenseQuery(
    itemsQueryOptions.detail(identity, itemId),
  )
  const { data: albums } = useSuspenseQuery(
    artistQueryOptions.albums(identity, itemId),
  )

  const imageUrl = artist ? getBestImageUrl(artist, 300) : null
  const seedColor = useArtworkColor(imageUrl || null, {
    enabled: !!imageUrl,
  })

  if (!artist) {
    return <RouteErrorFallback message="Artist not found" />
  }

  return (
    <DynamicThemeScope
      seedColor={seedColor}
      className="relative flex flex-1 flex-col px-fluid-md py-6"
    >
      <FeatureErrorBoundary featureName="Artist">
        <Suspense fallback={<ArtistSkeleton />}>
          <ArtistView artist={artist} albums={albums} />
        </Suspense>
      </FeatureErrorBoundary>
    </DynamicThemeScope>
  )
}
