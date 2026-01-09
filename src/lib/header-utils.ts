import type { BaseItemDto } from '@/types/jellyfin'

/**
 * Creates authorization headers for Jellyfin API requests.
 * Returns an object with Authorization header if token is provided,
 * otherwise returns an empty object.
 *
 * @param token - The access token (can be null, undefined, or empty string)
 * @returns Object with Authorization header or empty object
 *
 * @example
 * getAuthHeaders('my-token') // => { Authorization: 'MediaBrowser Token="my-token"' }
 * getAuthHeaders(null) // => {}
 * getAuthHeaders('') // => {}
 */
export function getAuthHeaders(
  token: string | null | undefined,
): Record<string, string> {
  if (token && token.length > 0) {
    return { Authorization: `MediaBrowser Token="${token}"` }
  }
  return {}
}

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
