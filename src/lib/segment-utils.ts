import {
  DEFAULT_SEGMENT_COLOR,
  SEGMENT_COLORS,
  SEGMENT_TYPES,
} from './constants'
import type { MediaSegmentDto, MediaSegmentType } from '@/types/jellyfin'

export { SEGMENT_TYPES }
export const sortSegmentsByStart = (
  a: MediaSegmentDto,
  b: MediaSegmentDto,
): number => (a.StartTicks ?? 0) - (b.StartTicks ?? 0)

const sortedSegmentsCache = new WeakMap<
  Array<MediaSegmentDto>,
  Array<MediaSegmentDto>
>()

/**
 * Identity-stable sorted view: the same input array always returns the same
 * sorted array. React Compiler 1.0.0 does not cache `.toSorted()` calls in
 * compiled components (verified in its emitted output), and PlayerEditor's
 * row handlers key on the result's identity - a fresh array per render
 * cache-missed every SegmentListRow. Safe because query data is immutable
 * (TanStack structural sharing keeps the input array's identity per fetch).
 */
export const getSegmentsSortedByStart = (
  segments: Array<MediaSegmentDto>,
): Array<MediaSegmentDto> => {
  const cached = sortedSegmentsCache.get(segments)
  if (cached) return cached
  const sorted = segments.toSorted(sortSegmentsByStart)
  sortedSegmentsCache.set(segments, sorted)
  return sorted
}

const compareStrings = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0

/**
 * Total order over the fields compared by areSegmentListsEqual, used to
 * normalize list order before comparing. Display order is derived state
 * (sorted by start with insertion tie-breakers), so it must not affect the
 * dirty check.
 */
const compareSegmentsCanonical = (
  a: MediaSegmentDto,
  b: MediaSegmentDto,
): number =>
  (a.StartTicks ?? 0) - (b.StartTicks ?? 0) ||
  (a.EndTicks ?? 0) - (b.EndTicks ?? 0) ||
  compareStrings(a.Id ?? '', b.Id ?? '') ||
  compareStrings(a.Type ?? '', b.Type ?? '')

/**
 * Compares two segment lists as unordered collections by per-segment
 * Id/Type/StartTicks/EndTicks. Same segments in a different order are equal;
 * list order is presentation-only. Missing elements (sparse arrays or
 * explicit undefined entries) are treated as unequal.
 */
export const areSegmentListsEqual = (
  a: ReadonlyArray<MediaSegmentDto | undefined>,
  b: ReadonlyArray<MediaSegmentDto | undefined>,
): boolean => {
  if (a.length !== b.length) return false

  const listA = a.filter(
    (segment): segment is MediaSegmentDto => segment !== undefined,
  )
  const listB = b.filter(
    (segment): segment is MediaSegmentDto => segment !== undefined,
  )
  if (listA.length !== a.length || listB.length !== b.length) return false

  const sortedA = listA.toSorted(compareSegmentsCanonical)
  const sortedB = listB.toSorted(compareSegmentsCanonical)

  return (
    sortedA.length === sortedB.length &&
    sortedA.every((segment, index) => {
      const other = sortedB[index] as MediaSegmentDto | undefined
      return (
        other !== undefined &&
        segment.Id === other.Id &&
        segment.Type === other.Type &&
        segment.StartTicks === other.StartTicks &&
        segment.EndTicks === other.EndTicks
      )
    })
  )
}

/**
 * Reference to a segment captured at interaction time (e.g. when a delete
 * confirmation opens). `id` is preferred for resolution because the list can
 * re-sort between capture and confirmation; `index` is the fallback for
 * segments without an Id.
 */
export interface SegmentRef {
  id?: MediaSegmentDto['Id']
  index: number
}

/**
 * Resolves a captured SegmentRef against the current list. Returns the
 * current index of the referenced segment, or -1 when it no longer exists.
 */
export const resolveSegmentIndex = (
  segments: ReadonlyArray<MediaSegmentDto>,
  ref: SegmentRef,
): number => {
  if (ref.id) {
    return segments.findIndex((segment) => segment.Id === ref.id)
  }
  return ref.index >= 0 && ref.index < segments.length ? ref.index : -1
}

type SegmentColorConfig = (typeof SEGMENT_COLORS)[MediaSegmentType]

/**
 * Runtime-safe color lookup. Segment data comes from the server, which may
 * report enum values this client doesn't know yet (newer Jellyfin versions);
 * those fall back to the default color instead of crashing the render.
 */
const getSegmentColorConfig = (
  type: MediaSegmentType | undefined,
): SegmentColorConfig => {
  if (!type) return DEFAULT_SEGMENT_COLOR
  const config = SEGMENT_COLORS[type] as SegmentColorConfig | undefined
  return config ?? DEFAULT_SEGMENT_COLOR
}

export const getSegmentColor = (type: MediaSegmentType | undefined): string =>
  getSegmentColorConfig(type).bg

export const getSegmentCssVar = (type: MediaSegmentType | undefined): string =>
  getSegmentColorConfig(type).css

/**
 * A segment mapped to percent-based track coordinates for timeline rendering.
 * Shared by the player scrubber and the read-only episode-list timeline.
 */
export interface SegmentRegion {
  id: MediaSegmentDto['Id']
  type: MediaSegmentDto['Type']
  /** Left edge as percent of track width [0, 100] */
  start: number
  /** Width as percent of track width [0, 100] */
  width: number
  /** CSS color value for the segment type */
  color: string
  /** Segment start in seconds, clamped to [0, duration] */
  startSeconds: number
  /** Segment end in seconds, clamped to [0, duration] */
  endSeconds: number
}

export interface SegmentRegionOptions {
  /**
   * Minimum rendered width in percent. Regions narrower than this are
   * widened to stay visible (shifted left when they would overflow the
   * track). Without this option, regions narrower than 0.1% are dropped,
   * which matches the player scrubber's historical behavior.
   */
  minVisibleWidthPercent?: number
}

/**
 * Maps segments (times in seconds) onto percent-based track regions.
 * Segments outside [0, duration] are clamped; degenerate spans are dropped.
 */
export const getSegmentRegions = (
  segments: Array<MediaSegmentDto> | undefined,
  duration: number,
  options?: SegmentRegionOptions,
): Array<SegmentRegion> => {
  if (!segments || segments.length === 0 || duration <= 0) return []

  const minVisibleWidth = options?.minVisibleWidthPercent
  const regions: Array<SegmentRegion> = []
  for (const segment of segments) {
    const startSeconds = segment.StartTicks ?? 0
    const startPercent = (startSeconds / duration) * 100
    if (startPercent >= 100) continue
    const endSeconds = segment.EndTicks ?? 0
    const endPercent = (endSeconds / duration) * 100
    const clampedStart = Math.max(0, startPercent)
    const clampedEnd = Math.min(100, endPercent)
    let width = Math.max(0, clampedEnd - clampedStart)
    let left = clampedStart

    if (minVisibleWidth === undefined) {
      if (width <= 0.1) continue
    } else {
      if (width <= 0) continue
      if (width < minVisibleWidth) {
        width = Math.min(minVisibleWidth, 100)
        left = Math.min(clampedStart, 100 - width)
      }
    }

    regions.push({
      id: segment.Id,
      type: segment.Type,
      start: left,
      width,
      color: getSegmentColorConfig(segment.Type).css,
      startSeconds: Math.max(0, Math.min(startSeconds, duration)),
      endSeconds: Math.max(0, Math.min(endSeconds, duration)),
    })
  }
  return regions
}

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const generateUUID = (): string => {
  const cryptoApi = globalThis.crypto

  if (
    typeof cryptoApi !== 'undefined' &&
    typeof cryptoApi.randomUUID === 'function'
  ) {
    return cryptoApi.randomUUID()
  }

  if (
    typeof cryptoApi !== 'undefined' &&
    typeof cryptoApi.getRandomValues === 'function'
  ) {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))

    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
      .slice(6, 8)
      .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
  }

  throw new Error('crypto.getRandomValues is unavailable')
}

export const isValidUUID = (uuid: string | null | undefined): boolean =>
  typeof uuid === 'string' && UUID_V4.test(uuid)
