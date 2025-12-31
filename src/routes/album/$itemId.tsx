/**
 * Album route - Displays album tracks.
 * Renders the AlbumView component for a specific album.
 * Requirements: 7.4
 */

import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import type { BaseItemDto } from '@/types/jellyfin'
import { AlbumView } from '@/components/views/AlbumView'
import { itemsKeys, useItem } from '@/hooks/queries/use-items'
import { Skeleton } from '@/components/ui/skeleton'
import { getItemById, getTracks } from '@/services/items/api'
import { useApiStore } from '@/stores/api-store'

/**
 * Query key factory for album-related queries.
 */
export const albumKeys = {
  all: ['album'] as const,
  tracks: (albumId: string) => [...albumKeys.all, 'tracks', albumId] as const,
}

/**
 * Loading skeleton for the album page.
 */
function AlbumSkeleton() {
  return (
    <main className="h-[calc(100vh-3.5rem)] p-6 overflow-auto">
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
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </main>
  )
}

export const Route = createFileRoute('/album/$itemId')({
  loader: async ({ params, context }) => {
    const { itemId } = params
    const { queryClient } = context

    // Prefetch album data
    await queryClient.ensureQueryData({
      queryKey: itemsKeys.detail(itemId),
      queryFn: () => getItemById(itemId),
      staleTime: 5 * 60 * 1000, // 5 minutes
    })

    // Prefetch tracks data
    await queryClient.ensureQueryData({
      queryKey: albumKeys.tracks(itemId),
      queryFn: () => getTracks(itemId),
      staleTime: 5 * 60 * 1000, // 5 minutes
    })
  },
  pendingComponent: AlbumSkeleton,
  component: AlbumPage,
})

/**
 * Hook to fetch tracks for an album.
 */
function useTracks(albumId: string) {
  const validConnection = useApiStore((state) => state.validConnection)

  return useQuery<Array<BaseItemDto>, Error>({
    queryKey: albumKeys.tracks(albumId),
    queryFn: () => getTracks(albumId),
    enabled: validConnection && !!albumId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

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
      <main className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="text-destructive">
          {error?.message || 'Album not found'}
        </div>
      </main>
    )
  }

  return (
    <main className="h-[calc(100vh-3.5rem)] p-6 overflow-auto">
      <AlbumView album={album} tracks={tracks || []} />
    </main>
  )
}
