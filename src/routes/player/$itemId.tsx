/**
 * Player route - Video player with segment editing.
 * Renders the PlayerEditor component for a specific media item.
 */

import { useEffect } from 'react'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { z } from 'zod'

import { PlayerEditor } from '@/components/player/PlayerEditor'
import {
  QUERY_STALE_TIMES,
  itemsKeys,
  segmentsKeys,
  useItem,
} from '@/hooks/queries'
import { Skeleton } from '@/components/ui/skeleton'
import { RouteErrorFallback } from '@/components/ui/route-error-fallback'
import { FeatureErrorBoundary } from '@/components/ui/feature-error-boundary'
import { getItemById } from '@/services/items/api'
import { getSegmentsById } from '@/services/segments/api'
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
    'Invalid item ID format',
  )

const playerParamsSchema = z.object({
  itemId: jellyfinIdSchema,
})

/**
 * Search params schema for the player route.
 * fetchSegments: Whether to fetch segments on mount (default: true)
 * Accepts both boolean and string 'true'/'false' values for flexibility.
 */
const playerSearchSchema = z.object({
  fetchSegments: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => {
      if (val === undefined) return true
      if (typeof val === 'boolean') return val
      return val === 'true'
    }),
})

/**
 * Loading skeleton for the player page.
 * Uses consistent height variables and ARIA attributes.
 */
function PlayerSkeleton() {
  return (
    <main
      className="min-h-[var(--spacing-page-min-height-lg)] px-4 py-6 sm:px-6 overflow-auto"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading player</span>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Video player skeleton */}
        <Skeleton className="aspect-video w-full rounded-2xl" />
        {/* Segment controls skeleton */}
        <div className="space-y-4">
          <Skeleton
            className="h-20 w-full rounded-2xl animate-in fade-in duration-300"
            style={{ animationDelay: '50ms' }}
          />
          <Skeleton
            className="h-20 w-full rounded-2xl animate-in fade-in duration-300"
            style={{ animationDelay: '100ms' }}
          />
        </div>
      </div>
    </main>
  )
}

export const Route = createFileRoute('/player/$itemId')({
  params: {
    parse: (params) => playerParamsSchema.parse(params),
    stringify: (params) => params,
  },
  validateSearch: playerSearchSchema,
  loader: async ({ params, context }) => {
    const { itemId } = params
    const { queryClient } = context

    // Prefetch item data
    await queryClient.ensureQueryData({
      queryKey: itemsKeys.detail(itemId),
      queryFn: () => getItemById(itemId),
      staleTime: QUERY_STALE_TIMES.LONG,
    })

    // Prefetch segments data
    await queryClient.ensureQueryData({
      queryKey: segmentsKeys.list(itemId),
      queryFn: () => getSegmentsById(itemId),
      staleTime: QUERY_STALE_TIMES.SHORT,
    })
  },
  onError: () => {
    // Throw notFound for invalid params (e.g., malformed UUID)
    throw notFound()
  },
  pendingComponent: PlayerSkeleton,
  component: PlayerPage,
})

function PlayerPage() {
  const { itemId } = Route.useParams()
  const { fetchSegments } = Route.useSearch()

  // Fetch item data using the hook (will use cached data from loader)
  const { data: item, isLoading, error } = useItem(itemId)

  // Extract vibrant color from item poster
  const imageUrl = item ? getBestImageUrl(item, 300) : null
  const vibrantColors = useVibrantColor(imageUrl || null)

  // Sync vibrant colors to session store for header
  const setVibrantColors = useSessionStore((s) => s.setVibrantColors)
  useEffect(() => {
    setVibrantColors(vibrantColors)
    return () => setVibrantColors(null)
  }, [vibrantColors, setVibrantColors])

  if (isLoading) {
    return <PlayerSkeleton />
  }

  if (error || !item) {
    return (
      <RouteErrorFallback
        message={error?.message || 'Item not found'}
        minHeightClass="min-h-[var(--spacing-page-min-height-lg)]"
      />
    )
  }

  return (
    <>
      {/* Full-screen background that extends behind header */}
      {vibrantColors && (
        <div
          className="fixed inset-0 -z-10 transition-colors duration-700"
          style={{ backgroundColor: vibrantColors.background }}
        />
      )}
      <main className="min-h-[var(--spacing-page-min-height-lg)] px-4 py-6 sm:px-6 overflow-auto">
        <FeatureErrorBoundary
          featureName="Player"
          minHeightClass="min-h-[var(--spacing-page-min-height-lg)]"
        >
          <PlayerEditor item={item} fetchSegments={fetchSegments} />
        </FeatureErrorBoundary>
      </main>
    </>
  )
}
