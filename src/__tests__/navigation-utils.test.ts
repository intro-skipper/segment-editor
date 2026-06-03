import { describe, expect, it, vi } from 'vitest'

import {
  getSeriesNavigationRoute,
  navigateToMediaItem,
} from '@/lib/navigation-utils'
import type { BaseItemDto } from '@/types/jellyfin'
import { BaseItemKind } from '@/types/jellyfin'

const seriesId = '00000000-0000-0000-0000-000000000001'
const seasonId = '00000000-0000-0000-0000-000000000003'

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

    const navigate = vi.fn().mockResolvedValue(undefined)

    navigateToMediaItem(navigate, season)

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith({
      to: '/series/$itemId',
      params: { itemId: seriesId },
      search: { seasonId },
    })
  })
})
