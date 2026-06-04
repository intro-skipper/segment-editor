import { describe, expect, it, vi } from 'vitest'

import {
  getSeriesNavigationRoute,
  navigateToMediaItem,
} from '@/lib/navigation-utils'
import type { BaseItemDto } from '@/types/jellyfin'
import { BaseItemKind } from '@/types/jellyfin'

const seriesId = '00000000-0000-0000-0000-000000000001'
const seasonId = '00000000-0000-0000-0000-000000000003'

const itemId = '00000000-0000-0000-0000-000000000002'

function expectNavigationForItem(
  item: BaseItemDto,
  expectedRoute: unknown,
): void {
  const navigate = vi.fn().mockResolvedValue(undefined)

  navigateToMediaItem(navigate, item)

  expect(navigate).toHaveBeenCalledTimes(1)
  expect(navigate).toHaveBeenCalledWith(expectedRoute)
}

describe('navigation-utils', () => {
  it('keeps a known season selected when navigating to a series route', () => {
    expect(getSeriesNavigationRoute(seriesId, seasonId)).toEqual({
      to: '/series/$itemId',
      params: { itemId: seriesId },
      search: { seasonId },
    })
  })

  it('does not add a season search param when no season is known', () => {
    const expectedRoute = {
      to: '/series/$itemId',
      params: { itemId: seriesId },
    }

    expect(getSeriesNavigationRoute(seriesId)).toEqual(expectedRoute)
    expect(getSeriesNavigationRoute(seriesId, undefined)).toEqual(expectedRoute)
    expect(getSeriesNavigationRoute(seriesId, null)).toEqual(expectedRoute)
  })

  it('opens season media items on their parent series with that season selected', () => {
    const season: BaseItemDto = {
      Id: seasonId,
      SeriesId: seriesId,
      Type: BaseItemKind.Season,
    }

    expectNavigationForItem(season, {
      to: '/series/$itemId',
      params: { itemId: seriesId },
      search: { seasonId },
    })
  })

  it('falls back home and warns when a season has no parent series', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const season: BaseItemDto = {
      Id: seasonId,
      Type: BaseItemKind.Season,
    }

    expectNavigationForItem(season, { to: '/' })

    expect(warn).toHaveBeenCalledWith(
      '[navigation-utils] Season item is missing SeriesId; falling back to home.',
      season,
    )
    warn.mockRestore()
  })

  it.each([
    BaseItemKind.AggregateFolder,
    BaseItemKind.BoxSet,
    BaseItemKind.CollectionFolder,
    BaseItemKind.Folder,
    BaseItemKind.ManualPlaylistsFolder,
    BaseItemKind.PhotoAlbum,
    BaseItemKind.Playlist,
    BaseItemKind.PlaylistsFolder,
    BaseItemKind.UserView,
  ])('opens %s containers as library collections', (type) => {
    expectNavigationForItem(
      { Id: itemId, Type: type },
      {
        to: '/',
        search: { collection: itemId, page: undefined, search: undefined },
      },
    )
  })

  it.each([
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
  ])('opens %s items in the player route', (type) => {
    expectNavigationForItem(
      { Id: itemId, Type: type },
      {
        to: '/player/$itemId',
        params: { itemId },
        search: { fetchSegments: 'true' },
      },
    )
  })

  it.each([
    [
      { Id: seriesId, Type: BaseItemKind.Series },
      { to: '/series/$itemId', params: { itemId: seriesId } },
    ],
    [
      { Id: itemId, Type: BaseItemKind.MusicArtist },
      { to: '/artist/$itemId', params: { itemId } },
    ],
    [
      { Id: itemId, Type: BaseItemKind.MusicAlbum },
      { to: '/album/$itemId', params: { itemId } },
    ],
  ])('opens detail item kinds on their detail route', (item, expectedRoute) => {
    expectNavigationForItem(item, expectedRoute)
  })
})
