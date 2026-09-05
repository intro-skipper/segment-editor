import type { BaseItemDto } from '@/types/jellyfin'
import { isSpecialSeason } from '@/lib/series-utils'

export interface AdjacentEpisodes {
  previous: BaseItemDto | null
  next: BaseItemDto | null
}

/** Data access the resolver needs; callers route these through the query cache. */
export interface SeriesFetchers {
  fetchSeasons: (seriesId: string) => Promise<Array<BaseItemDto>>
  fetchEpisodes: (
    seriesId: string,
    seasonId: string,
  ) => Promise<Array<BaseItemDto>>
}

const NO_ADJACENT: AdjacentEpisodes = { previous: null, next: null }

/**
 * Resolves the Adjacent Episodes of `episode` in Series Order (see CONTEXT.md):
 * seasons in the order Jellyfin returns them, episodes in order within each
 * season, crossing season boundaries and skipping seasons with no playable
 * episodes. Specials form their own lane, so a regular episode never steps
 * into Specials and a Special never steps out.
 */
export async function resolveAdjacentEpisodes(
  fetchers: SeriesFetchers,
  episode: BaseItemDto,
): Promise<AdjacentEpisodes> {
  const { Id: episodeId, SeriesId: seriesId, SeasonId: seasonId } = episode
  if (!episodeId || !seriesId || !seasonId) return NO_ADJACENT

  const seasons = await fetchers.fetchSeasons(seriesId)
  const currentSeason = seasons.find((season) => season.Id === seasonId)
  if (!currentSeason) return NO_ADJACENT

  const inSpecials = isSpecialSeason(currentSeason)
  const lane = seasons.filter(
    (season) => isSpecialSeason(season) === inSpecials,
  )
  const seasonIndex = lane.indexOf(currentSeason)

  const episodes = await fetchers.fetchEpisodes(seriesId, seasonId)
  const episodeIndex = episodes.findIndex((item) => item.Id === episodeId)
  if (episodeIndex === -1) return NO_ADJACENT

  /** Walks `candidates` in order and returns the first or last episode of the first season that has any. */
  const findAcrossSeasons = async (
    candidates: Array<BaseItemDto>,
    pick: 'first' | 'last',
  ): Promise<BaseItemDto | null> => {
    for (const season of candidates) {
      if (!season.Id) continue
      const seasonEpisodes = await fetchers.fetchEpisodes(seriesId, season.Id)
      if (seasonEpisodes.length === 0) continue
      return pick === 'first'
        ? seasonEpisodes[0]
        : seasonEpisodes[seasonEpisodes.length - 1]
    }
    return null
  }

  const [previous, next] = await Promise.all([
    episodeIndex > 0
      ? episodes[episodeIndex - 1]
      : findAcrossSeasons(lane.slice(0, seasonIndex).reverse(), 'last'),
    episodeIndex < episodes.length - 1
      ? episodes[episodeIndex + 1]
      : findAcrossSeasons(lane.slice(seasonIndex + 1), 'first'),
  ])

  return { previous, next }
}
