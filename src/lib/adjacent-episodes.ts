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
 * Jellyfin merges Specials that air before or after a season into that
 * season's listing when the user's DisplaySpecialsWithinSeasons setting is on
 * (the default). Series Order visits Specials once, at the end, so keep the
 * season's own episodes only.
 */
const ownEpisodes = (episodes: Array<BaseItemDto>, seasonId: string) =>
  episodes.filter((item) => item.SeasonId === seasonId)

/**
 * Resolves the Adjacent Episodes of `episode` in Series Order (see CONTEXT.md):
 * regular seasons in the order Jellyfin returns them, then Specials, with
 * episodes in order within each season. Stepping crosses season boundaries
 * and skips seasons with no playable episodes.
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

  // Same order the series page shows its season tabs in.
  const ordered = [
    ...seasons.filter((season) => !isSpecialSeason(season)),
    ...seasons.filter(isSpecialSeason),
  ]
  const seasonIndex = ordered.indexOf(currentSeason)

  const episodes = ownEpisodes(
    await fetchers.fetchEpisodes(seriesId, seasonId),
    seasonId,
  )
  const episodeIndex = episodes.findIndex((item) => item.Id === episodeId)
  if (episodeIndex === -1) return NO_ADJACENT

  /** Walks `candidates` in order and returns the first or last episode of the first season that has any. */
  const findAcrossSeasons = async (
    candidates: Array<BaseItemDto>,
    pick: 'first' | 'last',
  ): Promise<BaseItemDto | null> => {
    for (const season of candidates) {
      if (!season.Id) continue
      const seasonEpisodes = ownEpisodes(
        await fetchers.fetchEpisodes(seriesId, season.Id),
        season.Id,
      )
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
      : findAcrossSeasons(ordered.slice(0, seasonIndex).reverse(), 'last'),
    episodeIndex < episodes.length - 1
      ? episodes[episodeIndex + 1]
      : findAcrossSeasons(ordered.slice(seasonIndex + 1), 'first'),
  ])

  return { previous, next }
}
