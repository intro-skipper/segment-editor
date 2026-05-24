import { Suspense, lazy } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'

import { itemsQueryOptions } from '@/services/items/queries'
import { getBestImageUrl } from '@/services/video/api'
import { useVibrantColor } from '@/hooks/use-vibrant-color'
import { Skeleton } from '@/components/ui/skeleton'
import { RouteErrorFallback } from '@/components/ui/route-error-fallback'
import { FeatureErrorBoundary } from '@/components/ui/feature-error-boundary'
import { staggerDelay, STAGGER_SLOW } from '@/lib/animation-utils'

const routeApi = getRouteApi('/player/$itemId')

const PlayerEditor = lazy(() =>
  import('@/components/player/PlayerEditor').then((module) => ({
    default: module.PlayerEditor,
  })),
)

export function PlayerSkeleton() {
  return (
    <main
      className="min-h-[var(--spacing-page-min-height-lg)] px-4 py-6 sm:px-6 overflow-auto"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading player</span>
      <div className="max-w-6xl mx-auto space-y-6">
        <Skeleton className="aspect-video w-full rounded-2xl" />
        <div className="space-y-4">
          <Skeleton
            className="h-20 w-full rounded-2xl animate-in fade-in duration-300"
            style={{ animationDelay: staggerDelay(1, STAGGER_SLOW) }}
          />
          <Skeleton
            className="h-20 w-full rounded-2xl animate-in fade-in duration-300"
            style={{ animationDelay: staggerDelay(2, STAGGER_SLOW) }}
          />
        </div>
      </div>
    </main>
  )
}

export function PlayerPage() {
  const { itemId } = routeApi.useParams()
  const { fetchSegments } = routeApi.useSearch()

  const { data: item } = useSuspenseQuery(itemsQueryOptions.detail(itemId))

  const imageUrl = item ? getBestImageUrl(item, 300) : null
  const vibrantColors = useVibrantColor(imageUrl || null, {
    enabled: !!imageUrl,
  })

  if (!item) {
    return (
      <RouteErrorFallback
        message="Item not found"
        minHeightClass="min-h-[var(--spacing-page-min-height-lg)]"
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
      <main className="min-h-[var(--spacing-page-min-height-lg)] px-4 py-6 sm:px-6 overflow-auto relative z-10">
        <FeatureErrorBoundary
          featureName="Player"
          minHeightClass="min-h-[var(--spacing-page-min-height-lg)]"
        >
          <Suspense fallback={<PlayerSkeleton />}>
            <div className="animate-in fade-in duration-300">
              <PlayerEditor
                item={item}
                fetchSegments={fetchSegments}
                vibrantColors={vibrantColors}
              />
            </div>
          </Suspense>
        </FeatureErrorBoundary>
      </main>
    </>
  )
}
