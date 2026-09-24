import { Suspense, lazy } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'

import { itemsQueryOptions } from '@/services/items/queries'
import { getBestImageUrl } from '@/services/video/api'
import { useArtworkColor } from '@/hooks/use-artwork-color'
import { DynamicThemeScope } from '@/components/ui/dynamic-theme-scope'
import { Skeleton } from '@/components/ui/skeleton'
import { RouteErrorFallback } from '@/components/ui/route-error-fallback'
import { FeatureErrorBoundary } from '@/components/ui/feature-error-boundary'

const routeApi = getRouteApi('/player/$itemId')

const PlayerEditor = lazy(() =>
  import('@/components/player/PlayerEditor').then((module) => ({
    default: module.PlayerEditor,
  })),
)

export function PlayerSkeleton() {
  return (
    <div
      className="flex-1 px-4 py-6 sm:px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading player</span>
      <div className="max-w-6xl mx-auto space-y-6">
        <Skeleton className="aspect-video w-full rounded-2xl" />
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  )
}

export function PlayerPage() {
  const { itemId } = routeApi.useParams()
  const { fetchSegments } = routeApi.useSearch()

  const { data: item } = useSuspenseQuery(itemsQueryOptions.detail(itemId))

  const imageUrl = item ? getBestImageUrl(item, 300) : null
  const seedColor = useArtworkColor(imageUrl || null, {
    enabled: !!imageUrl,
  })

  if (!item) {
    return <RouteErrorFallback message="Item not found" />
  }

  return (
    <DynamicThemeScope
      seedColor={seedColor}
      className="relative z-10 flex flex-1 flex-col px-4 py-6 sm:px-6"
    >
      <FeatureErrorBoundary featureName="Player">
        <Suspense fallback={<PlayerSkeleton />}>
          <div className="animate-in fade-in animation-duration-300">
            <PlayerEditor item={item} fetchSegments={fetchSegments} />
          </div>
        </Suspense>
      </FeatureErrorBoundary>
    </DynamicThemeScope>
  )
}
