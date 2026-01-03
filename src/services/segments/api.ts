/**
 * Segment API service.
 * Handles CRUD operations for media segments.
 *
 * Security: All inputs are validated before use, and URL parameters are properly encoded.
 */

import type { MediaSegmentDto, MediaSegmentType } from '@/types/jellyfin'
import type { ApiOptions } from '@/lib/api-utils'
import { secondsToTicks, ticksToSeconds } from '@/lib/time-utils'
import { generateUUID } from '@/lib/segment-utils'
import { API_CONFIG } from '@/lib/constants'
import { AppError, isAbortError } from '@/lib/unified-error'
import { withRetryOrFalse } from '@/lib/retry-utils'
import { getAuthHeaders } from '@/lib/header-utils'
import {
  MediaSegmentArraySchema,
  encodeUrlParam,
  isValidItemId,
  isValidProviderId,
} from '@/lib/schemas'
import { logValidationWarning } from '@/lib/validation-logger'
import { getRequestConfig, getRetryOptions, logApiError } from '@/lib/api-utils'
import { useAppStore } from '@/stores/app-store'
import {
  getAccessToken,
  getServerBaseUrl,
  getTypedApis,
} from '@/services/jellyfin/sdk'

export interface CreateSegmentInput {
  itemId: string
  type: MediaSegmentType
  startSeconds: number
  endSeconds: number
}

export type SegmentApiOptions = ApiOptions

/** Converts server ticks to UI seconds */
const toUiSegment = (s: MediaSegmentDto): MediaSegmentDto => ({
  ...s,
  StartTicks: ticksToSeconds(s.StartTicks),
  EndTicks: ticksToSeconds(s.EndTicks),
})

/** Converts UI seconds to server ticks */
const toServerSegment = (s: MediaSegmentDto): MediaSegmentDto => ({
  ...s,
  Id: s.Id || generateUUID(),
  StartTicks: secondsToTicks(s.StartTicks ?? 0),
  EndTicks: secondsToTicks(s.EndTicks ?? 0),
})

/** Validation result for segment operations */
interface SegmentValidation {
  valid: boolean
  provider?: string
}

/** Validates segment creation prerequisites */
function validateSegmentCreation(
  segment: MediaSegmentDto,
  providerId?: string,
): SegmentValidation {
  const provider = providerId ?? useAppStore.getState().providerId

  if (!provider || !isValidProviderId(provider)) {
    console.error('Invalid or missing provider ID')
    return { valid: false }
  }

  if (!segment.ItemId || !isValidItemId(segment.ItemId)) {
    console.error('Invalid or missing Item ID')
    return { valid: false }
  }

  return { valid: true, provider }
}

/** Validates segment input data */
function validateSegmentInput(input: CreateSegmentInput): boolean {
  if (
    !input.itemId ||
    input.startSeconds < 0 ||
    input.endSeconds < 0 ||
    input.startSeconds >= input.endSeconds
  ) {
    console.error('Invalid segment input')
    return false
  }
  return true
}

/** Validates segment deletion prerequisites */
function validateSegmentDeletion(segment: MediaSegmentDto): boolean {
  if (!segment.Id || !isValidItemId(segment.Id)) {
    console.error('Invalid or missing segment ID')
    return false
  }
  return true
}

export async function getSegmentsById(
  itemId: string,
  options?: SegmentApiOptions,
): Promise<Array<MediaSegmentDto>> {
  if (!itemId || options?.signal?.aborted) return []

  try {
    const apis = getTypedApis()
    if (!apis) return []

    const { data } = await apis.mediaSegmentsApi.getItemSegments(
      { itemId },
      getRequestConfig(options, API_CONFIG.SEGMENT_TIMEOUT_MS),
    )
    const segments = data.Items ?? []

    const validation = MediaSegmentArraySchema.safeParse(segments)
    if (!validation.success)
      logValidationWarning('Segment API', validation.error)

    return segments.map(toUiSegment)
  } catch (error) {
    if (isAbortError(error)) return []
    logApiError(
      AppError.from(error, 'Failed to fetch segments'),
      'Segments API',
    )
    return []
  }
}

export async function createSegment(
  segment: MediaSegmentDto,
  providerId?: string,
  options?: SegmentApiOptions,
): Promise<MediaSegmentDto | false> {
  const validation = validateSegmentCreation(segment, providerId)
  if (!validation.valid) return false

  if (options?.signal?.aborted) return false

  const apis = getTypedApis()
  if (!apis) return false

  // Security: Properly encode URL parameters to prevent injection
  const url = `${getServerBaseUrl()}/MediaSegmentsApi/${encodeUrlParam(segment.ItemId!)}?providerId=${encodeUrlParam(validation.provider!)}`
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(getAccessToken()),
  }

  const result = await withRetryOrFalse(async () => {
    const { data } = await apis.api.axiosInstance.post<MediaSegmentDto>(
      url,
      toServerSegment(segment),
      { headers, ...getRequestConfig(options, API_CONFIG.SEGMENT_TIMEOUT_MS) },
    )
    return toUiSegment(data)
  }, getRetryOptions(options))

  if (result === false) console.error('Failed to create segment after retries')
  return result
}

export async function createSegmentFromInput(
  input: CreateSegmentInput,
  providerId?: string,
  options?: SegmentApiOptions,
): Promise<MediaSegmentDto | false> {
  if (!validateSegmentInput(input)) return false

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
  if (!validateSegmentDeletion(segment)) return false

  if (options?.signal?.aborted) return false

  const apis = getTypedApis()
  if (!apis) return false

  // Security: Properly encode URL parameters to prevent injection
  const params = new URLSearchParams()
  if (segment.ItemId && isValidItemId(segment.ItemId)) {
    params.set('itemId', segment.ItemId)
  }
  if (segment.Type != null) {
    params.set('type', String(segment.Type))
  }

  const url = `${getServerBaseUrl()}/MediaSegmentsApi/${encodeUrlParam(segment.Id!)}?${params}`

  const result = await withRetryOrFalse(async () => {
    await apis.api.axiosInstance.delete(url, {
      headers: getAuthHeaders(getAccessToken()),
      ...getRequestConfig(options, API_CONFIG.SEGMENT_TIMEOUT_MS),
    })
    return true
  }, getRetryOptions(options))

  if (result === false) console.error('Failed to delete segment after retries')
  return result !== false
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
  if (failures > 0) console.warn(`${failures} segment deletions failed`)

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
