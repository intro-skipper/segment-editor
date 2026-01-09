/**
 * ArtistView - Displays artist albums in a responsive grid.
 */

import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'

import type { BaseItemDto } from '@/types/jellyfin'
import { Button } from '@/components/ui/button'
import { ItemImage } from '@/components/media/ItemImage'
import { InteractiveCard } from '@/components/ui/interactive-card'
import { EmptyState } from '@/components/ui/async-state'

export interface ArtistViewProps {
  /** The artist item */
  artist: BaseItemDto
  /** Array of albums for the artist */
  albums: Array<BaseItemDto>
}

// ─────────────────────────────────────────────────────────────────────────────
// AlbumCard - Memoized album grid card
// ─────────────────────────────────────────────────────────────────────────────

interface AlbumCardProps {
  album: BaseItemDto
  onClick: () => void
}

const AlbumCard = React.memo(function AlbumCard({
  album,
  onClick,
}: AlbumCardProps) {
  const albumName = album.Name || 'Unknown Album'
  const year = album.ProductionYear ? ` (${album.ProductionYear})` : ''
  const ariaLabel = `View album: ${albumName}${year}`

  return (
    <InteractiveCard
      onClick={onClick}
      className="group w-full rounded-lg overflow-hidden hover:scale-[1.02] hover:shadow-lg focus-visible:ring-offset-2"
      aria-label={ariaLabel}
    >
      {/* Album Artwork */}
      <div className="aspect-square bg-muted rounded-lg overflow-hidden">
        <ItemImage
          item={album}
          maxWidth={200}
          aspectRatio="aspect-square"
          className="w-full h-full object-cover"
        />
      </div>

      {/* Album Name */}
      <div className="mt-2">
        <p
          className="text-sm font-medium line-clamp-2 text-foreground group-hover:text-primary transition-colors text-center"
          title={album.Name || undefined}
        >
          {album.Name || 'Unknown Album'}
        </p>
        {album.ProductionYear && (
          <p className="text-xs text-muted-foreground text-center mt-0.5">
            {album.ProductionYear}
          </p>
        )}
      </div>
    </InteractiveCard>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// ArtistView - Main component
// ─────────────────────────────────────────────────────────────────────────────

export function ArtistView({ artist, albums }: ArtistViewProps) {
  const navigate = useNavigate()

  const artistName = artist.Name || albums[0]?.AlbumArtist || 'Unknown Artist'

  const handleBack = React.useCallback(() => navigate({ to: '/' }), [navigate])

  const handleAlbumClick = React.useCallback(
    (albumId: string) => {
      navigate({ to: '/album/$itemId', params: { itemId: albumId } })
    },
    [navigate],
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={handleBack}
          className="rounded-full"
        >
          <ChevronLeft className="h-5 w-5" />
          <span className="sr-only">Go back</span>
        </Button>
        <h1 className="text-xl font-semibold">{artistName}</h1>
      </div>

      {/* Albums Grid */}
      {albums.length === 0 ? (
        <EmptyState
          message="No albums found for this artist"
          className="py-8"
        />
      ) : (
        <div
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
          role="list"
          aria-label={`${albums.length} albums by ${artistName}`}
        >
          {albums.map((album) => (
            <AlbumCard
              key={album.Id}
              album={album}
              onClick={() => handleAlbumClick(album.Id || '')}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default ArtistView
