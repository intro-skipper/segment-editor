/**
 * MediaCard component for displaying media items in the grid.
 * Handles navigation based on item type (movie, series, artist).
 * Requirements: 2.4, 2.5, 2.6
 */

import * as React from 'react'
import { useNavigate } from '@tanstack/react-router'

import type { BaseItemDto } from '@/types/jellyfin'
import { BaseItemKind } from '@/types/jellyfin'
import { ItemImage } from '@/components/media/ItemImage'
import { cn } from '@/lib/utils'

export interface MediaCardProps {
  /** The Jellyfin item to display */
  item: BaseItemDto
  /** Additional CSS classes */
  className?: string
}

/**
 * Determines the navigation route based on item type.
 * - Movies navigate to player with fetchSegments enabled
 * - Series navigate to series detail page
 * - Music artists navigate to artist detail page
 * - Other types navigate to player
 */
function getNavigationRoute(item: BaseItemDto): {
  to: string
  params?: Record<string, string>
  search?: Record<string, string>
} {
  const itemId = item.Id || ''

  switch (item.Type) {
    case BaseItemKind.Series:
      return {
        to: '/series/$itemId',
        params: { itemId },
      }

    case BaseItemKind.MusicArtist:
      return {
        to: '/artist/$itemId',
        params: { itemId },
      }

    case BaseItemKind.MusicAlbum:
      return {
        to: '/album/$itemId',
        params: { itemId },
      }

    case BaseItemKind.Movie:
    case BaseItemKind.Episode:
    case BaseItemKind.Audio:
    default:
      // Movies and other playable items go to player with fetchSegments
      return {
        to: '/player/$itemId',
        params: { itemId },
        search: { fetchSegments: 'true' },
      }
  }
}

/**
 * Generate accessible label based on item type.
 */
function getAccessibleLabel(item: BaseItemDto): string {
  const name = item.Name ?? 'Unknown'
  const year = item.ProductionYear ? ` (${item.ProductionYear})` : ''

  switch (item.Type) {
    case BaseItemKind.Series:
      return `View series: ${name}${year}`
    case BaseItemKind.MusicArtist:
      return `View artist: ${name}`
    case BaseItemKind.MusicAlbum:
      return `View album: ${name}${year}`
    case BaseItemKind.Movie:
      return `Play movie: ${name}${year}`
    case BaseItemKind.Episode:
      return `Play episode: ${name}`
    default:
      return `Play: ${name}${year}`
  }
}

/**
 * MediaCard displays a media item thumbnail with name.
 * Clicking navigates to the appropriate page based on item type.
 */
export const MediaCard = React.memo(function MediaCard({
  item,
  className,
}: MediaCardProps) {
  const navigate = useNavigate()

  const handleClick = React.useCallback(() => {
    const route = getNavigationRoute(item)
    navigate({
      to: route.to as '/',
      params: route.params,
      search: route.search,
    } as Parameters<typeof navigate>[0])
  }, [item, navigate])

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleClick()
      }
    },
    [handleClick],
  )

  const accessibleLabel = React.useMemo(() => getAccessibleLabel(item), [item])

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={accessibleLabel}
      className={cn(
        'group cursor-pointer rounded-lg overflow-hidden',
        'transition-all duration-200 ease-out',
        'hover:scale-[1.02] hover:shadow-lg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
    >
      {/* Item Thumbnail */}
      <ItemImage
        item={item}
        maxWidth={200}
        aspectRatio="aspect-[2/3]"
        className="w-full"
      />

      {/* Item Name */}
      <div className="p-2 bg-card">
        <p
          className="text-sm font-medium line-clamp-2 text-foreground group-hover:text-primary transition-colors"
          title={item.Name || undefined}
        >
          {item.Name || 'Unknown'}
        </p>

        {/* Optional: Show year for movies/series */}
        {item.ProductionYear && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {item.ProductionYear}
          </p>
        )}
      </div>
    </div>
  )
})

export default MediaCard
