import type { BaseItemKind } from './jellyfin'

/**
 * Represents a media item for navigation purposes.
 * Used for breadcrumbs and navigation state.
 */
export interface MediaNavigationItem {
  /** Unique identifier of the item */
  id: string
  /** Type of media item (Movie, Series, Episode, etc.) */
  type: BaseItemKind
  /** Display name of the item */
  name: string
  /** Name of the parent series (for episodes) */
  seriesName?: string
  /** Season number (for episodes) */
  seasonNumber?: number
  /** Episode number within the season */
  episodeNumber?: number
  /** Album name (for music tracks) */
  albumName?: string
  /** Track number within the album */
  trackNumber?: number
}
