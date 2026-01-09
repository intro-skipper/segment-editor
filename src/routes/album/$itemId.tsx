/**
 * Album route - Displays album tracks.
 * Renders the AlbumView component for a specific album.
 */

import { createFileRoute, notFound } from '@tanstack/react-router'
import { z } from 'zod'

import { AlbumView } from '@/components/views/AlbumView'
import {
  QUERY_STALE_TIMES,
  albumKeys,
  itemsKeys,
  useItem,
  useTracks,
} from '@/hooks/queries'
import { Skeleton } from '@/components/ui/skeleton'
import { RouteErrorFallback } from '@/components/ui/route-error-fallback'
import { FeatureErrorBoundary } from '@/components/ui/feature-error-boundary'
import { getItemById, getTracks } from '@/services/items/api'

/**
 * Route params schema - validates itemId is a valid UUID.
 * Security: Prevents injection attacks via malformed IDs.
 */
/**
 * Route params schema - validates itemId is a valid Jellyfin ID.
 * Accepts both standard UUID format and Jellyfin's 32-char hex format.
 * Security: Prevents injection attacks via malformed IDs.
 */
const jellyfinIdSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i,
    'Invalid album ID format',
  )

const albumParamsSchema = z.object({
  itemId: jellyfinIdSchema,
})

/**
 * Loading skeleton for the album page.
 * Uses consistent height variables and ARIA attributes.
 */
function AlbumSkeleton() {
  return (
    <main
      className="min-h-[var(--spacing-page-min-height-header)] px-4 py-6 sm:px-6 overflow-auto"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading album</span>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back button and title skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-8 w-48" />
        </div>
        {/* Album info skeleton */}
        <div className="flex gap-6">
          <Skeleton className="size-32 rounded-lg shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        {/* Track list skeleton */}
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-12 w-full rounded-lg animate-in fade-in duration-300"
              style={{ animationDelay: `${i * 40}ms` }}
            />
          ))}
        </div>
      </div>
    </main>
  )
}

export const Route = createFileRoute('/album/$itemId')({
  params: {
    parse: (params) => albumParamsSchema.parse(params),
    stringify: (params) => params,
  },
  loader: async ({ params, context }) => {
    const { itemId } = params
    const { queryClient } = context

    // Prefetch album data
    await queryClient.ensureQueryData({
      queryKey: itemsKeys.detail(itemId),
      queryFn: () => getItemById(itemId),
      staleTime: QUERY_STALE_TIMES.LONG,
    })

    // Prefetch tracks data
    await queryClient.ensureQueryData({
      queryKey: albumKeys.tracks(itemId),
      queryFn: () => getTracks(itemId),
      staleTime: QUERY_STALE_TIMES.LONG,
    })
  },
  onError: () => {
    // Throw notFound for invalid params (e.g., malformed UUID)
    throw notFound()
  },
  pendingComponent: AlbumSkeleton,
  component: AlbumPage,
})

function AlbumPage() {
  const { itemId } = Route.useParams()

  // Fetch album data using the hook (will use cached data from loader)
  const {
    data: album,
    isLoading: isLoadingAlbum,
    error: albumError,
  } = useItem(itemId)

  // Fetch tracks data
  const {
    data: tracks,
    isLoading: isLoadingTracks,
    error: tracksError,
  } = useTracks(itemId)

  const isLoading = isLoadingAlbum || isLoadingTracks
  const error = albumError || tracksError

  if (isLoading) {
    return <AlbumSkeleton />
  }

  if (error || !album) {
    return (
      <RouteErrorFallback
        message={error?.message || 'Album not found'}
        minHeightClass="min-h-[var(--spacing-page-min-height-header)]"
      />
    )
  }

  return (
    <main className="min-h-[var(--spacing-page-min-height-header)] px-4 py-6 sm:px-6 overflow-auto">
      <FeatureErrorBoundary
        featureName="Album"
        minHeightClass="min-h-[var(--spacing-page-min-height-header)]"
      >
        <AlbumView album={album} tracks={tracks || []} />
      </FeatureErrorBoundary>
    </main>
  )
}
