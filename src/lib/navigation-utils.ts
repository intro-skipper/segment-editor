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

  switch (itemType) {
    case BaseItemKind.AggregateFolder:
    case BaseItemKind.BoxSet:
    case BaseItemKind.CollectionFolder:
    case BaseItemKind.Folder:
    case BaseItemKind.ManualPlaylistsFolder:
    case BaseItemKind.PhotoAlbum:
    case BaseItemKind.Playlist:
    case BaseItemKind.PlaylistsFolder:
    case BaseItemKind.UserView:
      return {
        to: '/',
        search: { collection: itemId, page: undefined, search: undefined },
      }

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

    case undefined:
    case BaseItemKind.Audio:
    case BaseItemKind.AudioBook:
    case BaseItemKind.BasePluginFolder:
    case BaseItemKind.Book:
    case BaseItemKind.Channel:
    case BaseItemKind.ChannelFolderItem:
    case BaseItemKind.Episode:
    case BaseItemKind.Genre:
    case BaseItemKind.Movie:
    case BaseItemKind.LiveTvChannel:
    case BaseItemKind.LiveTvProgram:
    case BaseItemKind.MusicGenre:
    case BaseItemKind.MusicVideo:
    case BaseItemKind.Person:
    case BaseItemKind.Photo:
    case BaseItemKind.Program:
    case BaseItemKind.Recording:
    case BaseItemKind.Studio:
    case BaseItemKind.Trailer:
    case BaseItemKind.TvChannel:
    case BaseItemKind.TvProgram:
    case BaseItemKind.UserRootFolder:
    case BaseItemKind.Video:
    case BaseItemKind.Year:
      return getPlayerNavigationRoute(itemId)

    default:
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
