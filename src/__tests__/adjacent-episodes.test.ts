import { describe, expect, it, vi } from 'vitest'

import type { BaseItemDto } from '@/types/jellyfin'
import { BaseItemKind } from '@/types/jellyfin'
import { resolveAdjacentEpisodes } from '@/lib/adjacent-episodes'

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

/** A series laid out as seasons (in Jellyfin order) with their playable episodes. */
function series(layout: Array<[BaseItemDto, Array<BaseItemDto>]>) {
  const episodesBySeason = new Map(
    layout.map(([s, eps]) => [s.Id ?? '', eps] as const),
  )
  const fetchEpisodes = vi.fn(
    async (_seriesId: string, seasonId: string) =>
      episodesBySeason.get(seasonId) ?? [],
  )
  return {
    fetchers: {
      fetchSeasons: async () => layout.map(([s]) => s),
      fetchEpisodes,
    },
    fetchEpisodes,
  }
}

const S1 = season('s1', 1)
const S2 = season('s2', 2)
const S3 = season('s3', 3)
const SPECIALS = season('sp', 0)

describe('resolveAdjacentEpisodes', () => {
  it('steps within a season without touching other seasons', async () => {
    const { fetchers, fetchEpisodes } = series([
      [S1, [episode('s1', 1), episode('s1', 2), episode('s1', 3)]],
      [S2, [episode('s2', 1)]],
    ])

    const result = await resolveAdjacentEpisodes(fetchers, episode('s1', 2))

    expect(result.previous?.Id).toBe('s1-e1')
    expect(result.next?.Id).toBe('s1-e3')
    expect(fetchEpisodes).toHaveBeenCalledTimes(1)
  })

  it('crosses season boundaries in both directions', async () => {
    const { fetchers } = series([
      [S1, [episode('s1', 1), episode('s1', 2)]],
      [S2, [episode('s2', 1), episode('s2', 2)]],
    ])

    const lastOfS1 = await resolveAdjacentEpisodes(fetchers, episode('s1', 2))
    expect(lastOfS1.next?.Id).toBe('s2-e1')

    const firstOfS2 = await resolveAdjacentEpisodes(fetchers, episode('s2', 1))
    expect(firstOfS2.previous?.Id).toBe('s1-e2')
  })

  it('skips seasons with no playable episodes', async () => {
    const { fetchers } = series([
      [S1, [episode('s1', 1)]],
      [S2, []],
      [S3, [episode('s3', 1)]],
    ])

    const result = await resolveAdjacentEpisodes(fetchers, episode('s1', 1))

    expect(result.next?.Id).toBe('s3-e1')
  })

  it('has no adjacent episode at the ends of the series', async () => {
    const { fetchers } = series([[S1, [episode('s1', 1), episode('s1', 2)]]])

    const first = await resolveAdjacentEpisodes(fetchers, episode('s1', 1))
    expect(first.previous).toBeNull()

    const last = await resolveAdjacentEpisodes(fetchers, episode('s1', 2))
    expect(last.next).toBeNull()
  })

  it('keeps Specials out of Series Order and in their own lane', async () => {
    const namedSpecials = season('extras', 7, 'Special Features')
    const { fetchers } = series([
      [SPECIALS, [episode('sp', 1), episode('sp', 2)]],
      [S1, [episode('s1', 1)]],
      [namedSpecials, [episode('extras', 1)]],
    ])

    const regular = await resolveAdjacentEpisodes(fetchers, episode('s1', 1))
    expect(regular.previous).toBeNull()
    expect(regular.next).toBeNull()

    const special = await resolveAdjacentEpisodes(fetchers, episode('sp', 2))
    expect(special.previous?.Id).toBe('sp-e1')
    expect(special.next?.Id).toBe('extras-e1')
  })

  it('resolves nothing when the episode is not in its season listing', async () => {
    const { fetchers } = series([[S1, [episode('s1', 1)]]])

    const result = await resolveAdjacentEpisodes(fetchers, episode('s1', 9))

    expect(result).toEqual({ previous: null, next: null })
  })
})
