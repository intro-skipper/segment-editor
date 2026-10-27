/**
 * Series Order through the seasons query and the Adjacent Episodes query, the
 * way the series page, the Episode Switcher and the header arrows read it.
 * Only the Jellyfin item API is faked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

import type { BaseItemDto } from '@/types/jellyfin'
import type * as ItemsApi from '@/services/items/api'
import { BaseItemKind } from '@/types/jellyfin'
import { seriesQueryOptions } from '@/services/items/queries'

const jellyfin = vi.hoisted(() => ({
  layout: new Map<BaseItemDto, Array<BaseItemDto>>(),
}))

vi.mock('@/services/items/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ItemsApi>()),
  getSeasons: vi.fn(async () => [...jellyfin.layout.keys()]),
  getEpisodes: vi.fn(
    async (_seriesId: string, seasonId: string) =>
      [...jellyfin.layout].find(([s]) => s.Id === seasonId)?.[1] ?? [],
  ),
}))

const { getEpisodes } = await import('@/services/items/api')

const season = (id: string, index: number, name?: string): BaseItemDto => ({
  Id: id,
  Type: BaseItemKind.Season,
  IndexNumber: index,
  Name: name ?? `Season ${index}`,
})

const episode = (seasonId: string, index: number): BaseItemDto => ({
  Id: `${seasonId}-e${index}`,
  Type: BaseItemKind.Episode,
  SeriesId: 'series',
  SeasonId: seasonId,
  IndexNumber: index,
})

/**
 * Serves a series laid out as seasons (in the order Jellyfin lists them) with
 * their playable episodes, and resolves through a fresh query cache.
 */
function series(layout: Array<[BaseItemDto, Array<BaseItemDto>]>) {
  jellyfin.layout = new Map(layout)
  const queryClient = new QueryClient()
  return {
    seasons: () => queryClient.fetchQuery(seriesQueryOptions.seasons('series')),
    adjacent: (of: BaseItemDto) =>
      queryClient.fetchQuery(
        seriesQueryOptions.adjacentEpisodes(of, queryClient),
      ),
  }
}

beforeEach(() => {
  vi.mocked(getEpisodes).mockClear()
})

const S1 = season('s1', 1)
const S2 = season('s2', 2)
const S3 = season('s3', 3)
const SPECIALS = season('sp', 0)

describe('Series Order', () => {
  it('steps within a season without touching other seasons', async () => {
    const { adjacent } = series([
      [S1, [episode('s1', 1), episode('s1', 2), episode('s1', 3)]],
      [S2, [episode('s2', 1)]],
    ])

    const result = await adjacent(episode('s1', 2))

    expect(result.previous?.Id).toBe('s1-e1')
    expect(result.next?.Id).toBe('s1-e3')
    expect(getEpisodes).toHaveBeenCalledTimes(1)
  })

  it('crosses season boundaries in both directions', async () => {
    const { adjacent } = series([
      [S1, [episode('s1', 1), episode('s1', 2)]],
      [S2, [episode('s2', 1), episode('s2', 2)]],
    ])

    const lastOfS1 = await adjacent(episode('s1', 2))
    expect(lastOfS1.next?.Id).toBe('s2-e1')

    const firstOfS2 = await adjacent(episode('s2', 1))
    expect(firstOfS2.previous?.Id).toBe('s1-e2')
  })

  it('skips seasons with no playable episodes', async () => {
    const { adjacent } = series([
      [S1, [episode('s1', 1)]],
      [S2, []],
      [S3, [episode('s3', 1)]],
    ])

    const result = await adjacent(episode('s1', 1))

    expect(result.next?.Id).toBe('s3-e1')
  })

  it('has no adjacent episode at the ends of the series', async () => {
    const { adjacent } = series([[S1, [episode('s1', 1), episode('s1', 2)]]])

    const first = await adjacent(episode('s1', 1))
    expect(first.previous).toBeNull()

    const last = await adjacent(episode('s1', 2))
    expect(last.next).toBeNull()
  })

  it('lists Specials after the regular seasons, wherever Jellyfin lists them', async () => {
    const namedSpecials = season('extras', 7, 'Special Features')
    const { seasons } = series([
      [SPECIALS, []],
      [S1, []],
      [namedSpecials, []],
      [S2, []],
    ])

    expect((await seasons()).map((s) => s.Id)).toEqual([
      's1',
      's2',
      'sp',
      'extras',
    ])
  })

  it('visits Specials after the last regular season, wherever Jellyfin lists them', async () => {
    const namedSpecials = season('extras', 7, 'Special Features')
    const { adjacent } = series([
      [SPECIALS, [episode('sp', 1), episode('sp', 2)]],
      [S1, [episode('s1', 1)]],
      [namedSpecials, [episode('extras', 1)]],
      [S2, [episode('s2', 1)]],
    ])

    const first = await adjacent(episode('s1', 1))
    expect(first.previous).toBeNull()
    expect(first.next?.Id).toBe('s2-e1')

    const lastRegular = await adjacent(episode('s2', 1))
    expect(lastRegular.next?.Id).toBe('sp-e1')

    const firstSpecial = await adjacent(episode('sp', 1))
    expect(firstSpecial.previous?.Id).toBe('s2-e1')

    const lastSpecial = await adjacent(episode('extras', 1))
    expect(lastSpecial.previous?.Id).toBe('sp-e2')
    expect(lastSpecial.next).toBeNull()
  })

  it('ignores Specials that Jellyfin merges into a season listing', async () => {
    const mergedSpecial: BaseItemDto = { ...episode('sp', 1), Id: 'sp-e1' }
    const { adjacent } = series([
      [SPECIALS, [mergedSpecial]],
      [S1, [mergedSpecial, episode('s1', 1), episode('s1', 2)]],
      [S2, [mergedSpecial, episode('s2', 1)]],
    ])

    const first = await adjacent(episode('s1', 1))
    expect(first.previous).toBeNull()

    const last = await adjacent(episode('s1', 2))
    expect(last.next?.Id).toBe('s2-e1')

    const endOfRegular = await adjacent(episode('s2', 1))
    expect(endOfRegular.next?.Id).toBe('sp-e1')
  })

  it('resolves nothing when the episode is not in its season listing', async () => {
    const { adjacent } = series([[S1, [episode('s1', 1)]]])

    const result = await adjacent(episode('s1', 9))

    expect(result).toEqual({ previous: null, next: null })
  })
})
