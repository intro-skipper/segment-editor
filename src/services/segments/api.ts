/**
 * Segment API service.
 * Handles CRUD operations for media segments.
 *
 * Architecture:
 * - Uses withApi pattern consistently for all operations
 * - Validation separated from API calls (SRP)
 * - Time conversion handled at boundary (UI seconds <-> server ticks)
 *
 * Security: All inputs validated before use, URL parameters properly encoded.
 */

import type { MediaSegmentDto } from '@/types/jellyfin'
import type { RetryOptions } from '@/lib/retry-utils'
import type { ApiOptions } from '@/services/jellyfin'
import {
  getAuthenticatedRequestConfig,
  getRequestConfig,
  getServerBaseUrl,
  withApi,
} from '@/services/jellyfin'
import { secondsToTicks, ticksToSeconds } from '@/lib/time-utils'
import { generateUUID } from '@/lib/segment-utils'
import { API_CONFIG } from '@/lib/constants'
import { withRetryOrFalse } from '@/lib/retry-utils'
import {
  MediaSegmentArraySchema,
  encodeUrlParam,
  isValidItemId,
} from '@/lib/schemas'
import { logValidationWarning } from '@/lib/unified-error'

type SegmentApiOptions = ApiOptions
const DEFAULT_SEGMENT_PROVIDER_ID = 'IntroSkipper'

// ─────────────────────────────────────────────────────────────────────────────
// Retry Configuration
// ─────────────────────────────────────────────────────────────────────────────

const getRetryOptions = (options?: { signal?: AbortSignal }): RetryOptions => ({
  maxRetries: API_CONFIG.MAX_RETRIES,
  baseDelay: API_CONFIG.BASE_RETRY_DELAY_MS,
  maxDelay: API_CONFIG.MAX_RETRY_DELAY_MS,
  signal: options?.signal,
})

// ─────────────────────────────────────────────────────────────────────────────
// Time Conversion (Boundary Layer)
// ─────────────────────────────────────────────────────────────────────────────

/** Converts server ticks to UI seconds */
const toUiSegment = (s: MediaSegmentDto): MediaSegmentDto => ({
  ...s,
  StartTicks: ticksToSeconds(s.StartTicks),
  EndTicks: ticksToSeconds(s.EndTicks),
})

/** Converts UI seconds to server ticks, ensuring ID exists */
const toServerSegment = (s: MediaSegmentDto): MediaSegmentDto => ({
  ...s,
  Id: s.Id || generateUUID(),
  StartTicks: secondsToTicks(s.StartTicks ?? 0),
  EndTicks: secondsToTicks(s.EndTicks ?? 0),
})

// ─────────────────────────────────────────────────────────────────────────────
// Validation (Single Responsibility)
// ─────────────────────────────────────────────────────────────────────────────

interface SegmentValidation {
  valid: boolean
}

/** Validates segment creation prerequisites */
const validateForCreate = (segment: MediaSegmentDto): SegmentValidation => {
  if (!segment.ItemId || !isValidItemId(segment.ItemId)) {
    console.error('[Segments] Invalid or missing Item ID')
    return { valid: false }
  }

  return { valid: true }
}

/** Validates segment deletion prerequisites */
const validateForDelete = (segment: MediaSegmentDto): boolean => {
  if (!segment.Id || !isValidItemId(segment.Id)) {
    console.error('[Segments] Invalid or missing segment ID')
    return false
  }
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// API Operations (Using withApi Pattern Consistently)
// ─────────────────────────────────────────────────────────────────────────────

/** Builds segment API URL with proper encoding */
const buildSegmentUrl = (path: string, params?: URLSearchParams): string => {
  const base = getServerBaseUrl()
  const qs = params?.toString()
  return `${base}/MediaSegmentsApi/${path}${qs ? `?${qs}` : ''}`
}

/** Executes segment mutation with retry logic */
const withSegmentRetry = <T>(
  fn: () => Promise<T>,
  options?: SegmentApiOptions,
): Promise<T | false> => withRetryOrFalse(fn, getRetryOptions(options))

export async function getSegmentsById(
  itemId: string,
  options?: SegmentApiOptions,
): Promise<Array<MediaSegmentDto>> {
  if (!itemId) return []

  const result = await withApi(async (apis) => {
    const { data } = await apis.mediaSegmentsApi.getItemSegments(
      { itemId },
      getRequestConfig(options, API_CONFIG.SEGMENT_TIMEOUT_MS),
    )
    const segments = data.Items ?? []

    const validation = MediaSegmentArraySchema.safeParse(segments)
    if (!validation.success) {
      logValidationWarning('Segment API', validation.error)
    }

    return segments.map(toUiSegment)
  }, options)

  return result ?? []
}

async function createSegment(
  segment: MediaSegmentDto,
  options?: SegmentApiOptions,
): Promise<MediaSegmentDto | false> {
  const validation = validateForCreate(segment)
  if (!validation.valid) return false

  const result = await withApi(async (apis) => {
    const url = buildSegmentUrl(
      encodeUrlParam(segment.ItemId!),
      new URLSearchParams({ providerId: DEFAULT_SEGMENT_PROVIDER_ID }),
    )

    return withSegmentRetry(async () => {
      const { data } = await apis.api.axiosInstance.post<MediaSegmentDto>(
        url,
        toServerSegment(segment),
        getAuthenticatedRequestConfig(
          apis.api.accessToken,
          options,
          API_CONFIG.SEGMENT_TIMEOUT_MS,
        ),
      )
      return toUiSegment(data)
    }, options)
  }, options)

  if (result === null || result === false) {
    console.error('[Segments] Failed to create segment')
    return false
  }
  return result
}

export async function deleteSegment(
  segment: MediaSegmentDto,
  options?: SegmentApiOptions,
): Promise<boolean> {
  if (!validateForDelete(segment)) return false

  const result = await withApi(async (apis) => {
    const params = new URLSearchParams()
    if (segment.ItemId && isValidItemId(segment.ItemId)) {
      params.set('itemId', segment.ItemId)
    }
    if (segment.Type != null) {
      params.set('type', String(segment.Type))
    }

    const url = buildSegmentUrl(encodeUrlParam(segment.Id!), params)

    return withSegmentRetry(async () => {
      await apis.api.axiosInstance.delete(
        url,
        getAuthenticatedRequestConfig(
          apis.api.accessToken,
          options,
          API_CONFIG.SEGMENT_TIMEOUT_MS,
        ),
      )
      return true
    }, options)
  }, options)

  if (result === null || result === false) {
    console.error('[Segments] Failed to delete segment')
    return false
  }
  return true
}

export async function batchSaveSegments(
  itemId: string,
  existingSegments: Array<MediaSegmentDto>,
  newSegments: Array<MediaSegmentDto>,
  options?: SegmentApiOptions,
): Promise<Array<MediaSegmentDto>> {
  if (options?.signal?.aborted) return []

  // Delete existing segments (continue on partial failure)
  const deleteResults = await Promise.allSettled(
    existingSegments.map((s) => deleteSegment(s, options)),
  )
  const failures = deleteResults.filter((r) => r.status === 'rejected').length
  if (failures > 0) {
    console.warn(`[Segments] ${failures} deletions failed`)
  }

  if (options?.signal?.aborted) return []

  // Create new segments
  const createResults = await Promise.allSettled(
    newSegments.map((s) =>
      createSegment(
        { ...s, ItemId: itemId, Id: s.Id || generateUUID() },
        options,
      ),
    ),
  )

  return createResults
    .filter(
      (r): r is PromiseFulfilledResult<MediaSegmentDto | false> =>
        r.status === 'fulfilled',
    )
    .map((r) => r.value)
    .filter((v): v is MediaSegmentDto => v !== false)
}
