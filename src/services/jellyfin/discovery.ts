/**
 * Jellyfin server discovery service.
 * Single Responsibility: Server discovery and scoring.
 * @module services/jellyfin/discovery
 */

import { RecommendedServerInfoScore } from '@jellyfin/sdk/lib/models/recommended-server-info'
import { getJellyfinClient, isAborted } from './core'
import type { RecommendedServerInfo } from '@jellyfin/sdk/lib/models/recommended-server-info'
import type { ApiOptions } from './types'
import { AppError, isAbortError } from '@/lib/unified-error'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DiscoveryResult {
  servers: Array<RecommendedServerInfo>
  error?: string
}

export interface ScoreDisplay {
  label: string
  variant: 'success' | 'warning' | 'error'
}

// ─────────────────────────────────────────────────────────────────────────────
// Discovery
// ─────────────────────────────────────────────────────────────────────────────

export async function discoverServers(
  address: string,
  options?: ApiOptions & { minimumScore?: RecommendedServerInfoScore },
): Promise<DiscoveryResult> {
  const trimmed = address.trim()

  if (!trimmed) return { servers: [], error: 'Server address is required' }
  if (isAborted(options?.signal))
    return { servers: [], error: 'Discovery cancelled' }

  try {
    const servers =
      await getJellyfinClient().discovery.getRecommendedServerCandidates(
        trimmed,
        options?.minimumScore ?? RecommendedServerInfoScore.BAD,
      )

    if (isAborted(options?.signal))
      return { servers: [], error: 'Discovery cancelled' }

    return { servers: sortServersByScore(servers) }
  } catch (error) {
    if (isAbortError(error) || isAborted(options?.signal)) {
      return { servers: [], error: 'Discovery cancelled' }
    }
    return { servers: [], error: AppError.from(error).message }
  }
}

export function sortServersByScore(
  servers: Array<RecommendedServerInfo>,
): Array<RecommendedServerInfo> {
  return [...servers].sort((a, b) => {
    const scoreDiff = b.score - a.score
    if (scoreDiff !== 0) return scoreDiff

    const aHttps = a.address.toLowerCase().startsWith('https://')
    const bHttps = b.address.toLowerCase().startsWith('https://')
    return aHttps !== bHttps ? (aHttps ? -1 : 1) : 0
  })
}

export function findBestServer(
  servers: Array<RecommendedServerInfo>,
): RecommendedServerInfo | null {
  return servers.length === 0 ? null : (sortServersByScore(servers)[0] ?? null)
}

// ─────────────────────────────────────────────────────────────────────────────
// Display Helpers
// ─────────────────────────────────────────────────────────────────────────────

const SCORE_DISPLAY: Record<RecommendedServerInfoScore, ScoreDisplay> = {
  [RecommendedServerInfoScore.GREAT]: {
    label: 'Excellent',
    variant: 'success',
  },
  [RecommendedServerInfoScore.GOOD]: { label: 'Good', variant: 'success' },
  [RecommendedServerInfoScore.OK]: { label: 'Fair', variant: 'warning' },
  [RecommendedServerInfoScore.BAD]: { label: 'Poor', variant: 'error' },
}

export const getScoreDisplay = (
  score: RecommendedServerInfoScore,
): ScoreDisplay => SCORE_DISPLAY[score]

export { RecommendedServerInfoScore }
export type { RecommendedServerInfo }
