/**
 * ArtistView component for displaying artist albums.
 * Displays albums in a grid layout with navigation to album details.
 * Requirements: 7.3
 */

import { useNavigate } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'

import type { BaseItemDto } from '@/types/jellyfin'
import { Button } from '@/components/ui/button'
import { ItemImage } from '@/components/media/ItemImage'
import { cn } from '@/lib/utils'

export interface ArtistViewProps {
  /** The artist item */
  artist: BaseItemDto
  /** Array of albums for the artist */
  albums: Array<BaseItemDto>
}

interface AlbumCardProps {
  /** The album item */
  album: BaseItemDto
  /** Click handler */
  onClick: () => void
}

/**
 * Album card component displaying album artwork and name.
 */
function AlbumCard({ album, onClick }: AlbumCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className={cn(
        'group cursor-pointer rounded-lg overflow-hidden',
        'transition-all duration-200 ease-out',
        'hover:scale-[1.02] hover:shadow-lg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'w-full',
      )}
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
    </div>
  )
}

/**
 * ArtistView displays an artist with their albums in a grid.
 * Clicking an album navigates to the album detail page.
 */
export function ArtistView({ artist, albums }: ArtistViewProps) {
  const navigate = useNavigate()

  const artistName = artist.Name || albums[0]?.AlbumArtist || 'Unknown Artist'

  const handleBack = () => {
    navigate({ to: '/' })
  }

  const handleAlbumClick = (album: BaseItemDto) => {
    navigate({
      to: '/album/$itemId',
      params: { itemId: album.Id || '' },
    })
  }

  return (
    <div className="space-y-6">
      {/* Header with back button and artist name */}
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
        <div className="text-center text-muted-foreground py-8">
          No albums found for this artist
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {albums.map((album) => (
            <AlbumCard
              key={album.Id}
              album={album}
              onClick={() => handleAlbumClick(album)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default ArtistView
