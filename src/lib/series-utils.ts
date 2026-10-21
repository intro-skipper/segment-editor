import type { BaseItemDto } from '@/types/jellyfin'

/**
 * Whether a season is the series' Specials season (see CONTEXT.md).
 * Jellyfin numbers Specials as season 0, but some metadata providers
 * number them differently, so the name is checked as well.
 */
export const isSpecialSeason = (season: BaseItemDto): boolean =>
  season.IndexNumber === 0 ||
  (season.Name ?? '').toLowerCase().includes('special')

/**
 * The season the series page shows: `selectedSeasonId` when it names one of
 * `seasons`, else the first regular season, else the first season. The route
 * loader uses it to prefetch that season's episodes.
 */
export function resolveSelectedSeasonId(
  seasons: Array<BaseItemDto>,
  selectedSeasonId?: string | null,
): string | null {
  if (selectedSeasonId && seasons.some((s) => s.Id === selectedSeasonId)) {
    return selectedSeasonId
  }
  return seasons.find((s) => !isSpecialSeason(s))?.Id ?? seasons[0]?.Id ?? null
}
