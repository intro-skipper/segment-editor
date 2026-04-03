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
 * Parses a provider ID string to a valid integer.
 * Returns undefined for missing, empty, or non-numeric values.
 */
export function parseProviderId(value: string | undefined): number | undefined {
  if (!value) return undefined
  const n = parseInt(value, 10)
  return Number.isNaN(n) ? undefined : n
}

/**
 * Converts a Jellyfin segment type string to its SkipMe.db equivalent.
 * Returns null for unsupported types (Commercial, Unknown).
 */
export function toSkipMeSegmentType(type: string | undefined): string | null {
  if (!type) return null
  return SKIPME_TYPE_MAP[type] ?? null
}

/**
 * Converts Jellyfin RunTimeTicks to milliseconds.
 * Returns undefined if the value is missing or non-positive.
 */
export function runTimeTicksToMs(
  runTimeTicks: number | null | undefined,
): number | undefined {
  if (!runTimeTicks) return undefined
  const ms = Math.round(runTimeTicks / 10_000)
  return ms > 0 ? ms : undefined
}

/**
 * Converts segment ticks (stored in seconds by toUiSegment) to milliseconds
 * and validates the result against the episode duration.
 *
 * Returns `{ valid: false }` when timing is invalid, otherwise the converted values.
 */
export function convertAndValidateSegmentTiming(
  startTicks: number | null | undefined,
  endTicks: number | null | undefined,
  durationMs: number,
):
  | { valid: false; reason: 'invalidTiming' | 'exceedsDuration' }
  | { valid: true; startMs: number; endMs: number } {
  const startMs = Math.round((startTicks ?? 0) * 1000)
  const endMs = Math.round((endTicks ?? 0) * 1000)
  if (startMs >= endMs) return { valid: false, reason: 'invalidTiming' }
  if (endMs > durationMs) return { valid: false, reason: 'exceedsDuration' }
  return { valid: true, startMs, endMs }
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

interface SkipMeSubmitResponse {
  ok: boolean
  submission?: {
    id: string
    status: string
  }
}

interface SkipMeCollectionSubmitResponse {
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
