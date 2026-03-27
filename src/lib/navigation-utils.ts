/**
 * Navigation utilities for media item routing.
 * Consolidates route configuration used across components.
 */

import type { BaseItemDto } from '@/types/jellyfin'
import { BaseItemKind } from '@/types/jellyfin'

/**
 * Route configuration by item type.
 * Maps Jellyfin item types to their corresponding route paths.
 */
const ROUTE_MAP: Record<string, string> = {
  [BaseItemKind.Series]: '/series/$itemId',
  [BaseItemKind.MusicArtist]: '/artist/$itemId',
  [BaseItemKind.MusicAlbum]: '/album/$itemId',
} as const

/**
 * Container types that should browse into their children
 * rather than opening the player/editor.
 */
const CONTAINER_TYPES = new Set<string>([
  BaseItemKind.BoxSet,
  BaseItemKind.Folder,
  BaseItemKind.CollectionFolder,
  BaseItemKind.Playlist,
  BaseItemKind.AggregateFolder,
  BaseItemKind.UserView,
  BaseItemKind.PhotoAlbum,
  BaseItemKind.ManualPlaylistsFolder,
  BaseItemKind.PlaylistsFolder,
])

/**
 * Navigation route result type.
 */
interface NavigationRoute {
  to: string
  params?: { itemId: string }
  search?: Record<string, string | undefined>
}

type RouteConsumer = (...args: Array<never>) => unknown

function asRouteArg<TConsumer extends RouteConsumer>(
  route: NavigationRoute,
): Parameters<TConsumer>[0] {
  return route as Parameters<TConsumer>[0]
}

/**
 * Checks whether a media item is a container that should browse into
 * its children rather than opening the player.
 */
function isContainerItem(item: BaseItemDto): boolean {
  return CONTAINER_TYPES.has(item.Type ?? '')
}

/**
 * Gets the navigation route for a media item based on its type.
 * - Container types (BoxSet, Folder, Playlist, etc.) browse into their children.
 * - Series, artists, and albums navigate to their detail views.
 * - Other items navigate to the player with segment fetching enabled.
 *
 * @param item - The media item to get navigation route for
 * @returns Navigation route configuration
 */
function getNavigationRoute(item: BaseItemDto): NavigationRoute {
  const itemId = item.Id ?? ''

  // Container items browse into their children on the index page
  if (isContainerItem(item)) {
    return {
      to: '/',
      search: { collection: itemId, page: undefined, search: undefined },
    }
  }

  const to = ROUTE_MAP[item.Type ?? ''] ?? '/player/$itemId'
  const isPlayable = !ROUTE_MAP[item.Type ?? '']

  return {
    to,
    params: { itemId },
    ...(isPlayable && { search: { fetchSegments: 'true' } }),
  }
}

export function navigateToMediaItem<TNavigate extends RouteConsumer>(
  navigate: TNavigate,
  item: BaseItemDto,
): void {
  if (!item.Id) {
    return
  }

  const route = getNavigationRoute(item)
  navigate(asRouteArg<TNavigate>(route))
}

export function preloadMediaRoute<TPreload extends RouteConsumer>(
  preloadRoute: TPreload,
  item: BaseItemDto,
): void {
  if (!item.Id) {
    return
  }

  const route = getNavigationRoute(item)
  void preloadRoute(asRouteArg<TPreload>(route))
}
