/**
 * Segment store: reads an item's segment set and replaces it as a whole.
 *
 * A read returns a snapshot whose version decides how the next replace
 * writes: providers with Intro-Skipper's editor endpoint get one atomic PUT
 * guarded by the read's ETag, older providers get delete-then-create. Times
 * are seconds on this side and ticks on the wire. Every failure rejects with
 * an AppError: a stale snapshot with CONFLICT, and a delete-then-create that
 * changed only part of the set with PARTIAL_SAVE.
 */

import type { MediaSegmentDto } from '@/types/jellyfin'
import type { Segment } from '@/types/segment'
import type { ApiOptions } from '@/services/jellyfin'
import type { JellyfinFetchOptions } from '@/services/jellyfin/http'
import { withApi } from '@/services/jellyfin'
import { jellyfinFetchEmpty, jellyfinFetchJson } from '@/services/jellyfin/http'
import { secondsToTicks, ticksToSeconds } from '@/lib/time-utils'
import { generateUUID } from '@/lib/segment-utils'
import { API_CONFIG } from '@/lib/constants'
import { withRetry } from '@/lib/retry-utils'
import {
  MediaSegmentArraySchema,
  encodeUrlParam,
  isValidItemId,
} from '@/lib/schemas'
import { AppError, ErrorCodes, logValidationWarning } from '@/lib/unified-error'

/** The write path a snapshot was read for; callers pass it back untouched. */
type SegmentVersion = { kind: 'bulk'; etag: string } | { kind: 'legacy' }

/** An item's segments and the version to replace them from. */
export interface SegmentSnapshot {
  segments: Array<Segment>
  version: SegmentVersion
}

/** Stands in for a snapshot that was never read: replacing it only creates. */
export const UNREAD_SNAPSHOT: SegmentSnapshot = {
  segments: [],
  version: { kind: 'legacy' },
}

const DEFAULT_SEGMENT_PROVIDER_ID = 'IntroSkipper'

type Server = Pick<JellyfinFetchOptions, 'baseUrl' | 'accessToken'>

const toSegment = (dto: MediaSegmentDto): Segment => ({
  id: dto.Id,
  itemId: dto.ItemId,
  type: dto.Type,
  startSeconds: ticksToSeconds(dto.StartTicks),
  endSeconds: ticksToSeconds(dto.EndTicks),
})

const toServerSegment = (segment: Segment): MediaSegmentDto => ({
  Id: segment.id || generateUUID(),
  ItemId: segment.itemId,
  Type: segment.type,
  StartTicks: secondsToTicks(segment.startSeconds),
  EndTicks: secondsToTicks(segment.endSeconds),
})

const toSnapshot = (
  segments: Array<MediaSegmentDto>,
  version: SegmentVersion,
): SegmentSnapshot => {
  const validation = MediaSegmentArraySchema.safeParse(segments)
  if (!validation.success) logValidationWarning('Segment API', validation.error)
  return { segments: segments.map(toSegment), version }
}

/** Intro-Skipper's editor endpoint: unfiltered reads and all writes. */
const editorEndpoint = (id: string): string =>
  `MediaSegmentsApi/${encodeUrlParam(id)}`

/** Jellyfin's core endpoint, read only for providers without the editor read. */
const coreEndpoint = (id: string): string =>
  `MediaSegments/${encodeUrlParam(id)}`

const writeRetry = {
  maxRetries: API_CONFIG.MAX_RETRIES,
  baseDelay: API_CONFIG.BASE_RETRY_DELAY_MS,
  maxDelay: API_CONFIG.MAX_RETRY_DELAY_MS,
}

const withServer = <T>(
  fn: (server: Server) => Promise<T>,
  options?: ApiOptions,
): Promise<T> =>
  withApi(
    (apis) =>
      fn({ baseUrl: apis.api.basePath, accessToken: apis.api.accessToken }),
    options,
  )

/**
 * Reads from the editor endpoint, the authoritative baseline the atomic
 * replace needs. Older providers answer 405 there, so their segments come
 * from the core endpoint and are replaced by delete-then-create.
 */
export function readSegments(
  itemId: string,
  options?: ApiOptions,
): Promise<SegmentSnapshot> {
  const timeout = options?.timeout ?? API_CONFIG.SEGMENT_TIMEOUT_MS
  return withServer(async (server) => {
    try {
      let etag: string | undefined
      const data = await jellyfinFetchJson<
        Array<MediaSegmentDto> | { Items?: Array<MediaSegmentDto> }
      >({
        ...server,
        endpoint: editorEndpoint(itemId),
        method: 'GET',
        signal: options?.signal,
        timeout,
        onResponse: (response) => {
          etag = response.headers.get('ETag') ?? undefined
        },
      })
      const segments = Array.isArray(data) ? data : (data.Items ?? [])
      return toSnapshot(
        segments,
        etag ? { kind: 'bulk', etag } : { kind: 'legacy' },
      )
    } catch (error) {
      const { status } = AppError.from(error)
      if (status !== 404 && status !== 405) throw error
    }

    const data = await jellyfinFetchJson<{ Items?: Array<MediaSegmentDto> }>({
      ...server,
      endpoint: coreEndpoint(itemId),
      method: 'GET',
      signal: options?.signal,
      timeout,
    })
    return toSnapshot(data.Items ?? [], { kind: 'legacy' })
  }, options)
}

/**
 * Replaces the item's whole segment set with `segments`, writing from the
 * snapshot those edits started from. Resolves with the snapshot to write
 * from next.
 */
export function replaceSegments(
  itemId: string,
  from: SegmentSnapshot,
  segments: Array<Segment>,
): Promise<SegmentSnapshot> {
  if (!isValidItemId(itemId)) {
    return Promise.reject(AppError.validation('Invalid item ID'))
  }
  const { version } = from
  const owned = segments.map((segment) => ({ ...segment, itemId }))
  return withServer((server) =>
    version.kind === 'bulk'
      ? putSegments(server, itemId, version.etag, owned)
      : recreateSegments(server, itemId, from.segments, owned),
  )
}

async function putSegments(
  server: Server,
  itemId: string,
  etag: string,
  segments: Array<Segment>,
): Promise<SegmentSnapshot> {
  const body = segments.map(toServerSegment)
  let status = 0
  let nextEtag: string | undefined
  let response: unknown
  try {
    response = await withRetry(
      () =>
        jellyfinFetchJson<unknown>({
          ...server,
          body,
          endpoint: editorEndpoint(itemId),
          method: 'PUT',
          headers: { 'If-Match': etag },
          timeout: API_CONFIG.SEGMENT_TIMEOUT_MS,
          onResponse: (httpResponse) => {
            status = httpResponse.status
            nextEtag = httpResponse.headers.get('ETag') ?? undefined
          },
        }),
      writeRetry,
    )
  } catch (error) {
    if (AppError.from(error).status !== 412) throw error
    throw new AppError(
      'Segments changed on the server since they were loaded. Your edits are kept; save again to replace them.',
      ErrorCodes.CONFLICT,
      false,
      412,
      error,
    )
  }

  // A synchronous PUT answers with the canonical set. A 202 accepted the
  // write before projecting it, so the requested set stands in until the
  // next read observes the projection.
  let saved = body
  if (status === 200) {
    const validation = MediaSegmentArraySchema.safeParse(response)
    if (validation.success) saved = validation.data
    else logValidationWarning('Segment API', validation.error)
  }
  return {
    segments: saved.map(toSegment),
    version: { kind: 'bulk', etag: nextEtag ?? etag },
  }
}

async function recreateSegments(
  server: Server,
  itemId: string,
  existing: Array<Segment>,
  segments: Array<Segment>,
): Promise<SegmentSnapshot> {
  const total = existing.length + segments.length
  let written = 0
  const settle = async <T>(writes: Array<Promise<T>>): Promise<Array<T>> => {
    const results = await Promise.allSettled(writes)
    const values = results.flatMap((r) =>
      r.status === 'fulfilled' ? [r.value] : [],
    )
    const failure = results.find(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    )
    written += values.length
    if (failure === undefined) return values
    const cause: unknown = failure.reason
    // Nothing written means the server still holds the read set.
    if (written === 0) throw cause
    throw new AppError(
      `Only ${written} of ${total} segment changes were saved. Your edits are kept; save again to finish.`,
      ErrorCodes.PARTIAL_SAVE,
      false,
      undefined,
      cause,
    )
  }

  // A failed delete stops the save before any create could duplicate it.
  await settle(existing.map((segment) => deleteSegment(server, segment)))
  const created = await settle(
    segments.map((segment) => createSegment(server, itemId, segment)),
  )
  return { segments: created, version: { kind: 'legacy' } }
}

async function createSegment(
  server: Server,
  itemId: string,
  segment: Segment,
): Promise<Segment> {
  const serverSegment = toServerSegment(segment)
  await withRetry(
    () =>
      jellyfinFetchEmpty({
        ...server,
        body: serverSegment,
        endpoint: editorEndpoint(itemId),
        method: 'POST',
        query: new URLSearchParams({ providerId: DEFAULT_SEGMENT_PROVIDER_ID }),
        timeout: API_CONFIG.SEGMENT_TIMEOUT_MS,
      }),
    writeRetry,
  )
  return toSegment(serverSegment)
}

async function deleteSegment(server: Server, segment: Segment): Promise<void> {
  const id = segment.id
  if (!isValidItemId(id)) {
    throw AppError.validation('Invalid or missing segment ID')
  }
  const query = new URLSearchParams()
  if (isValidItemId(segment.itemId)) query.set('itemId', segment.itemId)
  if (segment.type != null) query.set('type', segment.type)

  await withRetry(
    () =>
      jellyfinFetchEmpty({
        ...server,
        endpoint: editorEndpoint(id),
        method: 'DELETE',
        query,
        timeout: API_CONFIG.SEGMENT_TIMEOUT_MS,
      }),
    writeRetry,
  )
}
