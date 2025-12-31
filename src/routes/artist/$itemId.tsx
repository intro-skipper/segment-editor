/**
 * Artist route - Displays artist albums.
 * Renders the ArtistView component for a specific artist.
 * Requirements: 2.6, 7.3
 */

import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import type { BaseItemDto } from '@/types/jellyfin'
import { ArtistView } from '@/components/views/ArtistView'
import { itemsKeys, useItem } from '@/hooks/queries/use-items'
import { Skeleton } from '@/components/ui/skeleton'
import { getAlbums, getItemById } from '@/services/items/api'
import { useApiStore } from '@/stores/api-store'

/**
 * Query key factory for artist-related queries.
 */
export const artistKeys = {
  all: ['artist'] as const,
  albums: (artistId: string) =>
    [...artistKeys.all, 'albums', artistId] as const,
}

/**
 * Loading skeleton for the artist page.
 */
function ArtistSkeleton() {
  return (
    <main className="h-[calc(100vh-3.5rem)] p-6 overflow-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back button and title skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-8 w-48" />
        </div>
        {/* Albums grid skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
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
  loader: async ({ params, context }) => {
    const { itemId } = params
    const { queryClient } = context

    // Prefetch artist data
    await queryClient.ensureQueryData({
      queryKey: itemsKeys.detail(itemId),
      queryFn: () => getItemById(itemId),
      staleTime: 5 * 60 * 1000, // 5 minutes
    })

    // Prefetch albums data
    await queryClient.ensureQueryData({
      queryKey: artistKeys.albums(itemId),
      queryFn: () => getAlbums(itemId),
      staleTime: 5 * 60 * 1000, // 5 minutes
    })
  },
  pendingComponent: ArtistSkeleton,
  component: ArtistPage,
})

/**
 * Hook to fetch albums for an artist.
 */
function useAlbums(artistId: string) {
  const validConnection = useApiStore((state) => state.validConnection)

  return useQuery<Array<BaseItemDto>, Error>({
    queryKey: artistKeys.albums(artistId),
    queryFn: () => getAlbums(artistId),
    enabled: validConnection && !!artistId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

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
      <main className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="text-destructive">
          {error?.message || 'Artist not found'}
        </div>
      </main>
    )
  }

  return (
    <main className="h-[calc(100vh-3.5rem)] p-6 overflow-auto">
      <ArtistView artist={artist} albums={albums || []} />
    </main>
  )
}
