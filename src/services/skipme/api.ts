/**
 * SkipMe.db API service.
 * Handles submission of media segments to the crowd-sourced SkipMe.db database.
 *
 * API endpoints:
 * - POST https://db.skipme.workers.dev/v1/submit  (single segment)
 * - POST https://db.skipme.workers.dev/v1/collection  (batch)
 * At least one of tmdb_id, tvdb_id, or anilist_id is required per submission.
 *
 * Security: Request body is strictly typed; no user-controlled URL construction.
 */

import axios from 'axios'

const SKIPME_BASE_URL = 'https://db.skipme.workers.dev'

/**
 * Maps Jellyfin segment types to SkipMe.db segment type strings.
 * Returns null for types not supported by the SkipMe.db API.
 */
const SKIPME_TYPE_MAP: Partial<Record<string, string>> = {
  Intro: 'intro',
  Recap: 'recap',
  Outro: 'credits',
  Preview: 'preview',
}

/**
 * Converts a Jellyfin segment type string to its SkipMe.db equivalent.
 * Returns null for unsupported types (Commercial, Unknown).
 */
export function toSkipMeSegmentType(type: string | undefined): string | null {
  if (!type) return null
  return SKIPME_TYPE_MAP[type] ?? null
}

export interface SkipMeSubmitRequest {
  tmdb_id?: number
  tvdb_id?: number
  anilist_id?: number
  tvdb_season_id?: number
  tvdb_series_id?: number
  segment: string
  season?: number
  episode?: number
  duration_ms: number
  start_ms: number
  end_ms: number
}

export interface SkipMeSubmitResponse {
  ok: boolean
  submission?: {
    id: string
    status: string
  }
}

export interface SkipMeCollectionSubmitResponse {
  ok: boolean
  submitted?: number
}

/**
 * Submits a single segment to the SkipMe.db API.
 * Throws on network error or non-2xx response.
 */
export async function submitSegmentToSkipMe(
  request: SkipMeSubmitRequest,
): Promise<SkipMeSubmitResponse> {
  const response = await axios.post<SkipMeSubmitResponse>(
    `${SKIPME_BASE_URL}/v1/submit`,
    request,
    { headers: { 'Content-Type': 'application/json' } },
  )
  return response.data
}

/**
 * Submits a collection of segments to the SkipMe.db API.
 * Throws on network error or non-2xx response.
 */
export async function submitCollectionToSkipMe(
  requests: Array<SkipMeSubmitRequest>,
): Promise<SkipMeCollectionSubmitResponse> {
  const response = await axios.post<SkipMeCollectionSubmitResponse>(
    `${SKIPME_BASE_URL}/v1/collection`,
    requests,
    { headers: { 'Content-Type': 'application/json' } },
  )
  return response.data
}
