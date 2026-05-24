/**
 * Navigation utilities for media item routing.
 * Consolidates route configuration used across components.
 */

import type { NavigateOptions, RegisteredRouter } from '@tanstack/react-router'

import type { BaseItemDto } from '@/types/jellyfin'
import { BaseItemKind } from '@/types/jellyfin'

/**
 * Container types that should browse into their children
 * rather than opening the player/editor.
 */
const CONTAINER_TYPES = new Set<BaseItemKind>([
  BaseItemKind.AggregateFolder,
  BaseItemKind.BoxSet,
  BaseItemKind.CollectionFolder,
  BaseItemKind.Folder,
  BaseItemKind.ManualPlaylistsFolder,
  BaseItemKind.PhotoAlbum,
  BaseItemKind.Playlist,
  BaseItemKind.PlaylistsFolder,
  BaseItemKind.UserView,
])

/**
 * Navigation route result type.
 */
type NavigationRoute = NavigateOptions<RegisteredRouter>

function getDetailRoute(itemType: BaseItemKind | undefined) {
  switch (itemType) {
    case BaseItemKind.Series:
      return '/series/$itemId'
    case BaseItemKind.MusicArtist:
      return '/artist/$itemId'
    case BaseItemKind.MusicAlbum:
      return '/album/$itemId'
    default:
      return undefined
  }
}

/**
 * Checks whether a media item is a container that should browse into
 * its children rather than opening the player.
 */
function isContainerItem(item: BaseItemDto): boolean {
  return item.Type != null && CONTAINER_TYPES.has(item.Type)
}

/**
 * Gets the navigation route for a media item based on its type.
 * - Container types (BoxSet, Folder, Playlist, etc.) browse into their children.
 * - Series, artists, and albums navigate to their detail views.
 * - Season items navigate to their parent series view.
 * - Other items navigate to the player with segment fetching enabled.
 *
 * @param item - The media item to get navigation route for
 * @returns Navigation route configuration
 */
function getNavigationRoute(item: BaseItemDto): NavigationRoute {
  const itemId = item.Id ?? ''

  if (isContainerItem(item)) {
    return {
      to: '/',
      search: { collection: itemId, page: undefined, search: undefined },
    }
  }

  if (item.Type === BaseItemKind.Season) {
    if (!item.SeriesId) {
      console.warn(
        '[navigation-utils] Season item is missing SeriesId; falling back to home.',
        item,
      )
      return { to: '/' }
    }
    return {
      to: '/series/$itemId',
      params: { itemId: item.SeriesId },
    }
  }

  const detailRoute = getDetailRoute(item.Type)

  if (detailRoute !== undefined) {
    return {
      to: detailRoute,
      params: { itemId },
    }
  }

  return {
    to: '/player/$itemId',
    params: { itemId },
    search: { fetchSegments: 'true' },
  }
}

export function navigateToMediaItem(
  navigate: (options: NavigationRoute) => Promise<void>,
  item: BaseItemDto,
): void {
  if (!item.Id) {
    return
  }

  const route = getNavigationRoute(item)
  void navigate(route)
}

export function preloadMediaRoute(
  preloadRoute: (options: NavigationRoute) => Promise<unknown>,
  item: BaseItemDto,
): void {
  if (!item.Id) {
    return
  }

  const route = getNavigationRoute(item)
  void preloadRoute(route)
}
