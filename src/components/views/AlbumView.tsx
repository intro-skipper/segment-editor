/**
 * AlbumView component for displaying album tracks.
 * Displays tracks in a list with navigation to player.
 * Requirements: 7.4, 7.5
 */

import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ChevronLeft, Music, Play } from 'lucide-react'

import type { BaseItemDto } from '@/types/jellyfin'
import { Button } from '@/components/ui/button'
import { ItemImage } from '@/components/media/ItemImage'
import { cn } from '@/lib/utils'
import { formatReadableTime } from '@/lib/time-utils'

export interface AlbumViewProps {
  /** The album item */
  album: BaseItemDto
  /** Array of tracks for the album */
  tracks: Array<BaseItemDto>
}

interface TrackRowProps {
  /** The track item */
  track: BaseItemDto
  /** Track index (1-based) */
  index: number
  /** Click handler */
  onClick: () => void
}

/**
 * Track row component displaying track number, name, and duration.
 * Memoized to prevent re-renders when other tracks change.
 */
const TrackRow = React.memo(function TrackRow({
  track,
  index,
  onClick,
}: TrackRowProps) {
  const trackNumber = track.IndexNumber ?? index
  const duration = track.RunTimeTicks
    ? formatReadableTime(track.RunTimeTicks / 10000000)
    : '--:--'

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onClick()
      }
    },
    [onClick],
  )

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex items-center gap-4 p-3 rounded-lg',
        'cursor-pointer transition-colors',
        'hover:bg-accent/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'group',
      )}
    >
      {/* Track Number / Play Icon */}
      <div className="w-8 text-center text-muted-foreground">
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
      <div className="text-sm text-muted-foreground">{duration}</div>
    </div>
  )
})

/**
 * AlbumView displays an album with its tracks.
 * Clicking a track navigates to the player.
 */
export function AlbumView({ album, tracks }: AlbumViewProps) {
  const navigate = useNavigate()

  const albumName = album.Name || 'Unknown Album'
  const artistName = album.AlbumArtist || album.Artists?.[0] || 'Unknown Artist'

  const handleBack = React.useCallback(() => {
    navigate({ to: '/' })
  }, [navigate])

  // Memoize track click handler factory to prevent re-creating handlers
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
      {/* Header with back button */}
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
        {/* Album Artwork */}
        <div className="flex-shrink-0 w-[160px] h-[160px] sm:w-[200px] sm:h-[200px] bg-muted rounded-lg overflow-hidden mx-auto sm:mx-0">
          <ItemImage
            item={album}
            maxWidth={200}
            aspectRatio="aspect-square"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Album Details */}
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
        <div className="text-center text-muted-foreground py-8 flex flex-col items-center gap-2">
          <Music className="h-8 w-8" />
          <p>No tracks found for this album</p>
        </div>
      ) : (
        <div className="space-y-1">
          {tracks.map((track, index) => (
            <TrackRow
              key={track.Id}
              track={track}
              index={index + 1}
              onClick={() => handleTrackClick(track.Id || '')}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default AlbumView
