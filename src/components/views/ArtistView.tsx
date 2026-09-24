import { useNavigate } from '@tanstack/react-router'
import { Disc3 } from 'lucide-react'

import type { BaseItemDto } from '@/types/jellyfin'
import { ItemImage } from '@/components/media/ItemImage'
import { InteractiveCard } from '@/components/ui/interactive-card'
import { EmptyState } from '@/components/ui/empty-state'

interface ArtistViewProps {
  artist: BaseItemDto
  albums: Array<BaseItemDto>
}

interface AlbumCardProps {
  album: BaseItemDto
  albumId: string
  onAlbumSelect: (albumId: string) => void
}

const AlbumCard = function AlbumCardComponent({
  album,
  albumId,
  onAlbumSelect,
}: AlbumCardProps) {
  const albumName = album.Name || 'Unknown Album'
  const year = album.ProductionYear ? ` (${album.ProductionYear})` : ''
  const ariaLabel = `View album: ${albumName}${year}`

  const handleSelectAlbum = () => {
    onAlbumSelect(albumId)
  }

  return (
    <InteractiveCard
      variant="tile"
      onClick={handleSelectAlbum}
      aria-label={ariaLabel}
    >
      <div className="aspect-square bg-muted">
        <ItemImage
          item={album}
          maxWidth={200}
          aspectRatio="aspect-square"
          className="w-full h-full object-cover"
        />
      </div>

      <div className="px-3 py-2.5 md:px-4 md:py-3">
        <p
          className="text-sm md:text-base font-semibold truncate leading-snug text-foreground"
          title={album.Name || undefined}
        >
          {albumName}
        </p>
        {album.ProductionYear && (
          <p className="text-xs md:text-sm font-medium truncate text-muted-foreground">
            {album.ProductionYear}
          </p>
        )}
      </div>
    </InteractiveCard>
  )
}

export function ArtistView({ artist, albums }: ArtistViewProps) {
  const navigate = useNavigate({ from: '/artist/$itemId' })

  const artistName = artist.Name || albums[0]?.AlbumArtist || 'Unknown Artist'
  const handleAlbumClick = (albumId: string) => {
    void navigate({ to: '/album/$itemId', params: { itemId: albumId } })
  }

  return (
    <div className="space-y-6">
      {albums.length === 0 ? (
        <EmptyState
          icon={<Disc3 />}
          message="No albums found for this artist"
        />
      ) : (
        <ul
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
          aria-label={`${albums.length} albums by ${artistName}`}
        >
          {albums.map((album) => (
            <li
              key={album.Id}
              style={{
                contentVisibility: 'auto',
                containIntrinsicSize: '0 220px',
              }}
            >
              <AlbumCard
                album={album}
                albumId={album.Id || ''}
                onAlbumSelect={handleAlbumClick}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
