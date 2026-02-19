/**
 * Artist route - Displays artist albums.
 * Renders the ArtistView component for a specific artist.
 */

import { Suspense, lazy } from 'react'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { z } from 'zod'

import { QUERY_STALE_TIMES } from '@/hooks/queries/query-constants'
import {
  artistKeys,
  itemsKeys,
  useAlbums,
  useItem,
} from '@/hooks/queries/use-items'
import { Skeleton } from '@/components/ui/skeleton'
import { RouteErrorFallback } from '@/components/ui/route-error-fallback'
import { FeatureErrorBoundary } from '@/components/ui/feature-error-boundary'
import { getAlbums, getItemById } from '@/services/items/api'

const ArtistView = lazy(() =>
  import('@/components/views/ArtistView').then((module) => ({
    default: module.ArtistView,
  })),
)

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
    'Invalid artist ID format',
  )

const artistParamsSchema = z.object({
  itemId: jellyfinIdSchema,
})

/**
 * Loading skeleton for the artist page.
 * Uses consistent height variables and ARIA attributes.
 */
function ArtistSkeleton() {
  return (
    <main
      className="min-h-[var(--spacing-page-min-height-header)] px-4 py-6 sm:px-6 overflow-auto"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading artist</span>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back button and title skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-8 w-48" />
        </div>
        {/* Albums grid skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="space-y-2 animate-in fade-in duration-300"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

export const Route = createFileRoute('/artist/$itemId')({
  params: {
    parse: (params) => artistParamsSchema.parse(params),
    stringify: (params) => params,
  },
  loader: async ({ params, context }) => {
    const { itemId } = params
    const { queryClient } = context

    // Prefetch artist and albums data in parallel
    await Promise.all([
      queryClient.ensureQueryData({
        queryKey: itemsKeys.detail(itemId),
        queryFn: () => getItemById(itemId),
        staleTime: QUERY_STALE_TIMES.LONG,
      }),
      queryClient.ensureQueryData({
        queryKey: artistKeys.albums(itemId),
        queryFn: () => getAlbums(itemId),
        staleTime: QUERY_STALE_TIMES.LONG,
      }),
    ])
  },
  onError: () => {
    // Throw notFound for invalid params (e.g., malformed UUID)
    throw notFound()
  },
  pendingComponent: ArtistSkeleton,
  component: ArtistPage,
})

function ArtistPage() {
  const { itemId } = Route.useParams()

  // Fetch artist data using the hook (will use cached data from loader)
  const {
    data: artist,
    isLoading: isLoadingArtist,
    error: artistError,
  } = useItem(itemId)

  // Fetch albums data
  const {
    data: albums,
    isLoading: isLoadingAlbums,
    error: albumsError,
  } = useAlbums(itemId)

  const isLoading = isLoadingArtist || isLoadingAlbums
  const error = artistError || albumsError

  if (isLoading) {
    return <ArtistSkeleton />
  }

  if (error || !artist) {
    return (
      <RouteErrorFallback
        message={error?.message || 'Artist not found'}
        minHeightClass="min-h-[var(--spacing-page-min-height-header)]"
      />
    )
  }

  return (
    <main className="min-h-[var(--spacing-page-min-height-header)] px-4 py-6 sm:px-6 overflow-auto">
      <FeatureErrorBoundary
        featureName="Artist"
        minHeightClass="min-h-[var(--spacing-page-min-height-header)]"
      >
        <Suspense fallback={<ArtistSkeleton />}>
          <ArtistView artist={artist} albums={albums || []} />
        </Suspense>
      </FeatureErrorBoundary>
    </main>
  )
}
