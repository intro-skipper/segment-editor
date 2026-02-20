/**
 * AlbumView - Displays album tracks with navigation to player.
 */

import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ChevronLeft, Music, Play } from 'lucide-react'

import type { BaseItemDto } from '@/types/jellyfin'
import { Button } from '@/components/ui/button'
import { ItemImage } from '@/components/media/ItemImage'
import { InteractiveCard } from '@/components/ui/interactive-card'
import { EmptyState } from '@/components/ui/async-state'
import { cn } from '@/lib/utils'
import { formatReadableTime, ticksToSeconds } from '@/lib/time-utils'

interface AlbumViewProps {
  /** The album item */
  album: BaseItemDto
  /** Array of tracks for the album */
  tracks: Array<BaseItemDto>
}

// ─────────────────────────────────────────────────────────────────────────────
// TrackRow - Memoized track display
// ─────────────────────────────────────────────────────────────────────────────

interface TrackRowProps {
  track: BaseItemDto
  trackId: string
  index: number
  onTrackSelect: (trackId: string) => void
}

const TrackRow = React.memo(function TrackRowComponent({
  track,
  trackId,
  index,
  onTrackSelect,
}: TrackRowProps) {
  const trackNumber = track.IndexNumber ?? index
  const duration = track.RunTimeTicks
    ? formatReadableTime(ticksToSeconds(track.RunTimeTicks))
    : '--:--'

  const handleClick = React.useCallback(() => {
    onTrackSelect(trackId)
  }, [onTrackSelect, trackId])

  return (
    <InteractiveCard
      onClick={handleClick}
      className={cn(
        'flex items-center gap-4 p-3 rounded-lg',
        'hover:bg-accent/50 group',
      )}
      aria-label={`Play track ${trackNumber}: ${track.Name || `Track ${trackNumber}`}, duration ${duration}`}
    >
      {/* Track Number / Play Icon */}
      <div className="w-8 text-center text-muted-foreground" aria-hidden="true">
        <span className="group-hover:hidden">{trackNumber}</span>
        <Play className="h-4 w-4 hidden group-hover:inline" />
      </div>

      {/* Track Name */}
      <div className="flex-grow min-w-0">
        <p className="text-sm font-medium truncate">
          {track.Name || `Track ${trackNumber}`}
        </p>
      </div>

      {/* Duration */}
      <div
        className="text-sm text-muted-foreground"
        aria-label={`Duration: ${duration}`}
      >
        {duration}
      </div>
    </InteractiveCard>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// AlbumView - Main component
// ─────────────────────────────────────────────────────────────────────────────

export function AlbumView({ album, tracks }: AlbumViewProps) {
  const navigate = useNavigate()

  const albumName = album.Name || 'Unknown Album'
  const artistName = album.AlbumArtist || album.Artists?.[0] || 'Unknown Artist'

  const handleBack = React.useCallback(() => navigate({ to: '/' }), [navigate])

  const handleTrackClick = React.useCallback(
    (trackId: string) => {
      navigate({
        to: '/player/$itemId',
        params: { itemId: trackId },
        search: { fetchSegments: 'true' },
      })
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
      </div>

      {/* Album Info */}
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
          <h1 className="text-xl sm:text-2xl font-bold mt-1">{albumName}</h1>
          <p className="text-muted-foreground mt-2">{artistName}</p>
          {album.ProductionYear && (
            <p className="text-sm text-muted-foreground mt-1">
              {album.ProductionYear} • {tracks.length} tracks
            </p>
          )}
        </div>
      </div>

      {/* Tracks List */}
      {tracks.length === 0 ? (
        <EmptyState
          icon={<Music className="h-8 w-8" aria-hidden="true" />}
          message="No tracks found for this album"
          className="py-8"
        />
      ) : (
        <div
          className="space-y-1"
          role="list"
          aria-label={`${tracks.length} tracks in ${albumName}`}
        >
          {tracks.map((track, index) => (
            <div
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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
