import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'

import type { BaseItemDto } from '@/types/jellyfin'
import { Button } from '@/components/ui/button'
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

const AlbumCard = React.memo(function AlbumCardComponent({
  album,
  albumId,
  onAlbumSelect,
}: AlbumCardProps) {
  const albumName = album.Name || 'Unknown Album'
  const year = album.ProductionYear ? ` (${album.ProductionYear})` : ''
  const ariaLabel = `View album: ${albumName}${year}`

  const handleSelectAlbum = React.useCallback(() => {
    onAlbumSelect(albumId)
  }, [onAlbumSelect, albumId])

  return (
    <InteractiveCard
      onClick={handleSelectAlbum}
      className="group w-full rounded-lg overflow-hidden hover:scale-[1.02] hover:shadow-lg focus-visible:ring-offset-2"
      aria-label={ariaLabel}
    >
      <div className="aspect-square bg-muted rounded-lg overflow-hidden">
        <ItemImage
          item={album}
          maxWidth={200}
          aspectRatio="aspect-square"
          className="w-full h-full object-cover"
        />
      </div>

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

export function ArtistView({ artist, albums }: ArtistViewProps) {
  const navigate = useNavigate({ from: '/artist/$itemId' })

  const artistName = artist.Name || albums[0]?.AlbumArtist || 'Unknown Artist'

  const handleBack = React.useCallback(
    () => void navigate({ to: '/' }),
    [navigate],
  )

  const handleAlbumClick = React.useCallback(
    (albumId: string) => {
      void navigate({ to: '/album/$itemId', params: { itemId: albumId } })
    },
    [navigate],
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={handleBack}
          className="rounded-full"
        >
          <ChevronLeft className="size-5" />
          <span className="sr-only">Go back</span>
        </Button>
        <h1 className="text-xl font-semibold text-balance">{artistName}</h1>
      </div>

      {albums.length === 0 ? (
        <EmptyState
          message="No albums found for this artist"
          className="py-8"
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
