/**
 * Player route - Video player with segment editing.
 * Renders the PlayerEditor component for a specific media item.
 * Requirements: 2.4, 3.1, 4.1
 */

import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { PlayerEditor } from '@/components/player/PlayerEditor'
import { itemsKeys, useItem } from '@/hooks/queries/use-items'
import { Skeleton } from '@/components/ui/skeleton'

import { segmentsKeys } from '@/hooks/queries/use-segments'
import { getItemById } from '@/services/items/api'
import { getSegmentsById } from '@/services/segments/api'

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
 */
function PlayerSkeleton() {
  return (
    <main className="h-[calc(100vh-3.5rem)] p-6 overflow-auto">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Back button and title skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-8 w-64" />
        </div>
        {/* Video player skeleton */}
        <Skeleton className="aspect-video w-full rounded-lg" />
        {/* Segment controls skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      </div>
    </main>
  )
}

export const Route = createFileRoute('/player/$itemId')({
  validateSearch: playerSearchSchema,
  loader: async ({ params, context }) => {
    const { itemId } = params
    const { queryClient } = context

    // Prefetch item data
    await queryClient.ensureQueryData({
      queryKey: itemsKeys.detail(itemId),
      queryFn: () => getItemById(itemId),
      staleTime: 5 * 60 * 1000, // 5 minutes
    })

    // Prefetch segments data
    await queryClient.ensureQueryData({
      queryKey: segmentsKeys.list(itemId),
      queryFn: () => getSegmentsById(itemId),
      staleTime: 30 * 1000, // 30 seconds
    })
  },
  pendingComponent: PlayerSkeleton,
  component: PlayerPage,
})

function PlayerPage() {
  const { itemId } = Route.useParams()
  const { fetchSegments } = Route.useSearch()

  // Fetch item data using the hook (will use cached data from loader)
  const { data: item, isLoading, error } = useItem(itemId)

  if (isLoading) {
    return <PlayerSkeleton />
  }

  if (error || !item) {
    return (
      <main className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="text-destructive">
          {error?.message || 'Item not found'}
        </div>
      </main>
    )
  }

  return (
    <main className="h-[calc(100vh-3.5rem)] p-6 overflow-auto">
      <PlayerEditor item={item} fetchSegments={fetchSegments} />
    </main>
  )
}
