import { useNavigate } from '@tanstack/react-router'
import { Music, Play } from 'lucide-react'

import type { BaseItemDto } from '@/types/jellyfin'
import { ItemImage } from '@/components/media/ItemImage'
import { InteractiveCard } from '@/components/ui/interactive-card'
import { EmptyState } from '@/components/ui/empty-state'
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
      aria-label={`Play track ${trackNumber}: ${track.Name || `Track ${trackNumber}`}, duration ${duration}`}
    >
      <div
        className="w-8 text-center text-muted-foreground tabular-nums"
        aria-hidden="true"
      >
        <span className="group-hover:hidden">{trackNumber}</span>
        <Play className="size-4 hidden group-hover:inline" />
      </div>

      <div className="flex-grow min-w-0">
        <p className="text-sm font-medium truncate">
          {track.Name || `Track ${trackNumber}`}
        </p>
      </div>

      <div
        className="text-sm text-muted-foreground tabular-nums"
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
  const handleTrackClick = (trackId: string) => {
    void navigate({
      to: '/player/$itemId',
      params: { itemId: trackId },
      search: { fetchSegments: 'true' },
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
        <div className="flex-shrink-0 w-(--spacing-thumbnail-sm) h-(--spacing-thumbnail-sm) sm:w-(--spacing-thumbnail-md) sm:h-(--spacing-thumbnail-md) bg-muted rounded-lg overflow-hidden mx-auto sm:mx-0">
          <ItemImage
            item={album}
            maxWidth={200}
            aspectRatio="aspect-square"
            className="w-full h-full object-cover"
          />
        </div>

        <div className="flex flex-col justify-end text-center sm:text-left">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Album
          </p>
          <h2 className="text-xl sm:text-2xl font-semibold mt-1 text-balance">
            {albumName}
          </h2>
          <p className="text-muted-foreground mt-2">{artistName}</p>
          {album.ProductionYear && (
            <p className="text-sm text-muted-foreground mt-1">
              {album.ProductionYear} • {tracks.length} tracks
            </p>
          )}
        </div>
      </div>

      {tracks.length === 0 ? (
        <EmptyState icon={<Music />} message="No tracks found for this album" />
      ) : (
        <ul
          className="space-y-2 md:space-y-3"
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
