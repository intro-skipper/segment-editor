import type { BaseItemDto } from '@/types/jellyfin'

/**
 * Formats an episode label in S1E2 format.
 * Returns null if item is null or lacks episode information.
 *
 * @example
 * formatEpisodeLabel({ ParentIndexNumber: 1, IndexNumber: 5, Name: 'Pilot' })
 * // => 'S1E5 Pilot'
 */
export function formatEpisodeLabel(item: BaseItemDto | null): string | null {
  if (!item) return null

  const { ParentIndexNumber: season, IndexNumber: episode, Name: name } = item

  // If we have both season and episode numbers, format as S1E2
  if (season != null && episode != null) {
    const label = `S${season}E${episode}`
    // Append name unless it starts with "Episode" (redundant)
    return name && !name.toLowerCase().startsWith('episode')
      ? `${label} ${name}`
      : label
  }

  return name ?? null
}
