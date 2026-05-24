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

type DetailRoute = '/series/$itemId' | '/artist/$itemId' | '/album/$itemId'

type RouteIntent =
  | { kind: 'container' }
  | { kind: 'detail'; to: DetailRoute }
  | { kind: 'player' }
  | { kind: 'season' }

function getUnhandledRouteIntent(itemType: never): RouteIntent {
  console.warn(
    '[navigation-utils] Unhandled BaseItemKind; falling back to player route.',
    itemType,
  )
  return { kind: 'player' }
}

function getRouteIntent(itemType: BaseItemKind | undefined): RouteIntent {
  switch (itemType) {
    case undefined:
      return { kind: 'player' }

    case BaseItemKind.AggregateFolder:
    case BaseItemKind.BoxSet:
    case BaseItemKind.CollectionFolder:
    case BaseItemKind.Folder:
    case BaseItemKind.ManualPlaylistsFolder:
    case BaseItemKind.PhotoAlbum:
    case BaseItemKind.Playlist:
    case BaseItemKind.PlaylistsFolder:
    case BaseItemKind.UserView:
      return { kind: 'container' }

    case BaseItemKind.Season:
      return { kind: 'season' }

    case BaseItemKind.Series:
      return { kind: 'detail', to: '/series/$itemId' }
    case BaseItemKind.MusicArtist:
      return { kind: 'detail', to: '/artist/$itemId' }
    case BaseItemKind.MusicAlbum:
      return { kind: 'detail', to: '/album/$itemId' }

    case BaseItemKind.Audio:
    case BaseItemKind.AudioBook:
    case BaseItemKind.BasePluginFolder:
    case BaseItemKind.Book:
    case BaseItemKind.Channel:
    case BaseItemKind.ChannelFolderItem:
    case BaseItemKind.Episode:
    case BaseItemKind.Genre:
    case BaseItemKind.LiveTvChannel:
    case BaseItemKind.LiveTvProgram:
    case BaseItemKind.Movie:
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
      return { kind: 'player' }

    default:
      return getUnhandledRouteIntent(itemType)
  }
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
  const routeIntent = getRouteIntent(item.Type)

  switch (routeIntent.kind) {
    case 'container':
      return {
        to: '/',
        search: { collection: itemId, page: undefined, search: undefined },
      }
    case 'season':
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
    case 'detail':
      return {
        to: routeIntent.to,
        params: { itemId },
      }
    case 'player':
      return {
        to: '/player/$itemId',
        params: { itemId },
        search: { fetchSegments: 'true' },
      }
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
