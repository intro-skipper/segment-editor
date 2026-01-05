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

import type { MediaSegmentDto, MediaSegmentType } from '@/types/jellyfin'
import type { ApiOptions } from '@/services/jellyfin/sdk'
import type { RetryOptions } from '@/lib/retry-utils'
import { secondsToTicks, ticksToSeconds } from '@/lib/time-utils'
import { generateUUID } from '@/lib/segment-utils'
import { API_CONFIG } from '@/lib/constants'
import { withRetryOrFalse } from '@/lib/retry-utils'
import {
  MediaSegmentArraySchema,
  encodeUrlParam,
  isValidItemId,
  isValidProviderId,
} from '@/lib/schemas'
import { logValidationWarning } from '@/lib/unified-error'
import { useAppStore } from '@/stores/app-store'
import {
  getRequestConfig,
  getServerBaseUrl,
  withApi,
} from '@/services/jellyfin/sdk'

export interface CreateSegmentInput {
  itemId: string
  type: MediaSegmentType
  startSeconds: number
  endSeconds: number
}

export type SegmentApiOptions = ApiOptions

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
  provider?: string
}

/** Validates segment creation prerequisites */
const validateForCreate = (
  segment: MediaSegmentDto,
  providerId?: string,
): SegmentValidation => {
  const provider = providerId ?? useAppStore.getState().providerId

  if (!provider || !isValidProviderId(provider)) {
    console.error('[Segments] Invalid or missing provider ID')
    return { valid: false }
  }

  if (!segment.ItemId || !isValidItemId(segment.ItemId)) {
    console.error('[Segments] Invalid or missing Item ID')
    return { valid: false }
  }

  return { valid: true, provider }
}

/** Validates segment input data */
const validateInput = (input: CreateSegmentInput): boolean => {
  const { itemId, startSeconds, endSeconds } = input
  if (!itemId || startSeconds < 0 || endSeconds < 0 || startSeconds >= endSeconds) {
    console.error('[Segments] Invalid segment input')
    return false
  }
  return true
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
): Promise<T | false> =>
  withRetryOrFalse(fn, getRetryOptions(options))

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

export async function createSegment(
  segment: MediaSegmentDto,
  providerId?: string,
  options?: SegmentApiOptions,
): Promise<MediaSegmentDto | false> {
  const validation = validateForCreate(segment, providerId)
  if (!validation.valid) return false

  const result = await withApi(async (apis) => {
    const url = buildSegmentUrl(
      encodeUrlParam(segment.ItemId!),
      new URLSearchParams({ providerId: validation.provider! }),
    )

    return withSegmentRetry(async () => {
      const { data } = await apis.api.axiosInstance.post<MediaSegmentDto>(
        url,
        toServerSegment(segment),
        getRequestConfig(options, API_CONFIG.SEGMENT_TIMEOUT_MS),
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

export async function createSegmentFromInput(
  input: CreateSegmentInput,
  providerId?: string,
  options?: SegmentApiOptions,
): Promise<MediaSegmentDto | false> {
  if (!validateInput(input)) return false

  return createSegment(
    {
      Id: generateUUID(),
      ItemId: input.itemId,
      Type: input.type,
      StartTicks: input.startSeconds,
      EndTicks: input.endSeconds,
    },
    providerId,
    options,
  )
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
        getRequestConfig(options, API_CONFIG.SEGMENT_TIMEOUT_MS),
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

export async function updateSegment(
  oldSegment: MediaSegmentDto,
  newSegment: MediaSegmentDto,
  providerId?: string,
  options?: SegmentApiOptions,
): Promise<MediaSegmentDto | false> {
  if (options?.signal?.aborted) return false

  const deleted = await deleteSegment(oldSegment, options)
  if (!deleted || options?.signal?.aborted) return false

  return createSegment(newSegment, providerId, options)
}

export async function batchSaveSegments(
  itemId: string,
  existingSegments: Array<MediaSegmentDto>,
  newSegments: Array<MediaSegmentDto>,
  providerId?: string,
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
        providerId,
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
