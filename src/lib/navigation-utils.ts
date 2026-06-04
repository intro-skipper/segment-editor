/**
 * Navigation utilities for media item routing.
 * Consolidates route configuration used across components.
 */

import type { NavigateOptions, RegisteredRouter } from '@tanstack/react-router'

import type { BaseItemDto } from '@/types/jellyfin'
import { BaseItemKind } from '@/types/jellyfin'

/**
 * Navigation route result type.
 */
type NavigationRoute = NavigateOptions<RegisteredRouter>
type RoutableItemKind = BaseItemKind | undefined

const CONTAINER_ITEM_KINDS = [
  BaseItemKind.AggregateFolder,
  BaseItemKind.BoxSet,
  BaseItemKind.CollectionFolder,
  BaseItemKind.Folder,
  BaseItemKind.ManualPlaylistsFolder,
  BaseItemKind.PhotoAlbum,
  BaseItemKind.Playlist,
  BaseItemKind.PlaylistsFolder,
  BaseItemKind.UserView,
] as const

type ContainerItemKind = (typeof CONTAINER_ITEM_KINDS)[number]

const CONTAINER_ITEM_KIND_SET: ReadonlySet<RoutableItemKind> = new Set(
  CONTAINER_ITEM_KINDS,
)

const PLAYER_ITEM_KINDS = [
  undefined,
  BaseItemKind.Audio,
  BaseItemKind.AudioBook,
  BaseItemKind.BasePluginFolder,
  BaseItemKind.Book,
  BaseItemKind.Channel,
  BaseItemKind.ChannelFolderItem,
  BaseItemKind.Episode,
  BaseItemKind.Genre,
  BaseItemKind.Movie,
  BaseItemKind.LiveTvChannel,
  BaseItemKind.LiveTvProgram,
  BaseItemKind.MusicGenre,
  BaseItemKind.MusicVideo,
  BaseItemKind.Person,
  BaseItemKind.Photo,
  BaseItemKind.Program,
  BaseItemKind.Recording,
  BaseItemKind.Studio,
  BaseItemKind.Trailer,
  BaseItemKind.TvChannel,
  BaseItemKind.TvProgram,
  BaseItemKind.UserRootFolder,
  BaseItemKind.Video,
  BaseItemKind.Year,
] as const

type PlayerItemKind = (typeof PLAYER_ITEM_KINDS)[number]

const PLAYER_ITEM_KIND_SET: ReadonlySet<RoutableItemKind> = new Set(
  PLAYER_ITEM_KINDS,
)

function isContainerItemKind(
  itemType: RoutableItemKind,
): itemType is ContainerItemKind {
  return CONTAINER_ITEM_KIND_SET.has(itemType)
}

function isPlayerItemKind(
  itemType: RoutableItemKind,
): itemType is PlayerItemKind {
  return PLAYER_ITEM_KIND_SET.has(itemType)
}

function getPlayerNavigationRoute(itemId: string): NavigationRoute {
  return {
    to: '/player/$itemId',
    params: { itemId },
    search: { fetchSegments: 'true' },
  }
}

export function getSeriesNavigationRoute(
  seriesId: string,
  seasonId?: string | null,
): NavigationRoute {
  if (seasonId) {
    return {
      to: '/series/$itemId',
      params: { itemId: seriesId },
      search: { seasonId },
    }
  }

  return { to: '/series/$itemId', params: { itemId: seriesId } }
}

function getUnhandledItemKindRoute(
  itemType: never,
  itemId: string,
): NavigationRoute {
  console.warn(
    '[navigation-utils] Unhandled BaseItemKind; defaulting to player.',
    itemType,
  )

  return getPlayerNavigationRoute(itemId)
}

/**
 * Gets the navigation route for a media item based on its type.
 * - Container types (BoxSet, Folder, Playlist, etc.) browse into their children.
 * - Series, artists, and albums navigate to their detail views.
 * - Season items navigate to their parent series view with the season selected.
 * - Other items navigate to the player with segment fetching enabled.
 *
 * @param item - The media item to get navigation route for
 * @returns Navigation route configuration
 */
function getNavigationRoute(item: BaseItemDto): NavigationRoute {
  const itemId = item.Id ?? ''
  const itemType = item.Type

  if (isContainerItemKind(itemType)) {
    return {
      to: '/',
      search: { collection: itemId, page: undefined, search: undefined },
    }
  }

  switch (itemType) {
    case BaseItemKind.Season:
      if (!item.SeriesId) {
        console.warn(
          '[navigation-utils] Season item is missing SeriesId; falling back to home.',
          item,
        )
        return { to: '/' }
      }
      return getSeriesNavigationRoute(item.SeriesId, item.Id)

    case BaseItemKind.Series:
      return getSeriesNavigationRoute(itemId)

    case BaseItemKind.MusicArtist:
      return { to: '/artist/$itemId', params: { itemId } }

    case BaseItemKind.MusicAlbum:
      return { to: '/album/$itemId', params: { itemId } }

    default:
      if (isPlayerItemKind(itemType)) {
        return getPlayerNavigationRoute(itemId)
      }

      return getUnhandledItemKindRoute(itemType, itemId)
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
