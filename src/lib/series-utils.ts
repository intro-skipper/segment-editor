import type { BaseItemDto } from '@/types/jellyfin'

/**
 * Whether a season is the series' Specials season (see CONTEXT.md).
 * Jellyfin numbers Specials as season 0, but some metadata providers
 * number them differently, so the name is checked as well.
 */
export const isSpecialSeason = (season: BaseItemDto): boolean =>
  season.IndexNumber === 0 ||
  (season.Name ?? '').toLowerCase().includes('special')
