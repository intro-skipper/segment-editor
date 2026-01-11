/**
 * Subtitle utility functions.
 * @module services/video/subtitle/utils
 */

import type { SubtitleTrackInfo } from '../tracks'

/**
 * Checks if a subtitle track requires JASSUB rendering (ASS/SSA format).
 */
export function requiresJassubRenderer(track: SubtitleTrackInfo): boolean {
  const format = track.format.toLowerCase()
  return format === 'ass' || format === 'ssa'
}
