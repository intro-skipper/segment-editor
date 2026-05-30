import { useNavigate } from '@tanstack/react-router'
import { ChevronLeft, Music, Play } from 'lucide-react'

import type { BaseItemDto } from '@/types/jellyfin'
import { Button } from '@/components/ui/button'
import { ItemImage } from '@/components/media/ItemImage'
import { InteractiveCard } from '@/components/ui/interactive-card'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { formatReadableTime, ticksToSeconds } from '@/lib/time-utils'

interface AlbumViewProps {
  album: BaseItemDto
  tracks: Array<BaseItemDto>
}

interface TrackRowProps {
  track: BaseItemDto
  trackId: string
  index: number
  onTrackSelect: (trackId: string) => void
}

const TrackRow = function TrackRowComponent({
  track,
  trackId,
  index,
  onTrackSelect,
}: TrackRowProps) {
  const trackNumber = track.IndexNumber ?? index
  const duration = track.RunTimeTicks
    ? formatReadableTime(ticksToSeconds(track.RunTimeTicks))
    : '--:--'

  const handleSelectTrack = () => {
    onTrackSelect(trackId)
  }

  return (
    <InteractiveCard
      onClick={handleSelectTrack}
      className={cn(
        'flex items-center gap-4 p-3 rounded-lg',
        'hover:bg-accent/50 group',
      )}
      aria-label={`Play track ${trackNumber}: ${track.Name || `Track ${trackNumber}`}, duration ${duration}`}
    >
      <div className="w-8 text-center text-muted-foreground" aria-hidden="true">
        <span className="group-hover:hidden">{trackNumber}</span>
        <Play className="size-4 hidden group-hover:inline" />
      </div>

      <div className="flex-grow min-w-0">
        <p className="text-sm font-medium truncate">
          {track.Name || `Track ${trackNumber}`}
        </p>
      </div>

      <div
        className="text-sm text-muted-foreground"
        aria-label={`Duration: ${duration}`}
      >
        {duration}
      </div>
    </InteractiveCard>
  )
}

export function AlbumView({ album, tracks }: AlbumViewProps) {
  const navigate = useNavigate({ from: '/album/$itemId' })

  const albumName = album.Name || 'Unknown Album'
  const artistName = album.AlbumArtist || album.Artists?.[0] || 'Unknown Artist'

  const handleBack = () => void navigate({ to: '/' })

  const handleTrackClick = (trackId: string) => {
    void navigate({
      to: '/player/$itemId',
      params: { itemId: trackId },
      search: { fetchSegments: 'true' },
    })
  }

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
      </div>

      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
        <div className="flex-shrink-0 w-[var(--spacing-thumbnail-sm)] h-[var(--spacing-thumbnail-sm)] sm:w-[var(--spacing-thumbnail-md)] sm:h-[var(--spacing-thumbnail-md)] bg-muted rounded-lg overflow-hidden mx-auto sm:mx-0">
          <ItemImage
            item={album}
            maxWidth={200}
            aspectRatio="aspect-square"
            className="w-full h-full object-cover"
          />
        </div>

        <div className="flex flex-col justify-end text-center sm:text-left">
          <p className="text-sm text-muted-foreground uppercase tracking-wide">
            Album
          </p>
          <h1 className="text-xl sm:text-2xl font-semibold mt-1 text-balance">
            {albumName}
          </h1>
          <p className="text-muted-foreground mt-2">{artistName}</p>
          {album.ProductionYear && (
            <p className="text-sm text-muted-foreground mt-1">
              {album.ProductionYear} • {tracks.length} tracks
            </p>
          )}
        </div>
      </div>

      {tracks.length === 0 ? (
        <EmptyState
          icon={<Music className="size-8" aria-hidden="true" />}
          message="No tracks found for this album"
          className="py-8"
        />
      ) : (
        <ul
          className="space-y-1"
          aria-label={`${tracks.length} tracks in ${albumName}`}
        >
          {tracks.map((track, index) => (
            <li
              key={track.Id}
              style={{
                contentVisibility: 'auto',
                containIntrinsicSize: '0 64px',
              }}
            >
              <TrackRow
                track={track}
                trackId={track.Id || ''}
                index={index + 1}
                onTrackSelect={handleTrackClick}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
