import {
  DEFAULT_SEGMENT_COLOR,
  SEGMENT_COLORS,
  SEGMENT_TYPES,
} from './constants'
import { lookup } from './utils'
import type { MediaSegmentType } from '@/types/jellyfin'
import type { Segment } from '@/types/segment'

export { SEGMENT_TYPES }
export const sortSegmentsByStart = (a: Segment, b: Segment): number =>
  a.startSeconds - b.startSeconds

const sortedSegmentsCache = new WeakMap<Array<Segment>, Array<Segment>>()

/**
 * Identity-stable sorted view: the same input array always returns the same
 * sorted array. React Compiler 1.0.0 does not cache `.toSorted()` calls in
 * compiled components (verified in its emitted output), and PlayerEditor's
 * row handlers key on the result's identity - a fresh array per render
 * cache-missed every SegmentListRow. Safe because query data is immutable
 * (TanStack structural sharing keeps the input array's identity per fetch).
 */
export const getSegmentsSortedByStart = (
  segments: Array<Segment>,
): Array<Segment> => {
  const cached = sortedSegmentsCache.get(segments)
  if (cached) return cached
  const sorted = segments.toSorted(sortSegmentsByStart)
  sortedSegmentsCache.set(segments, sorted)
  return sorted
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
  return lookup(SEGMENT_COLORS, type) ?? DEFAULT_SEGMENT_COLOR
}

export const getSegmentColor = (type: MediaSegmentType | undefined): string =>
  getSegmentColorConfig(type).bg

export const getSegmentCssVar = (type: MediaSegmentType | undefined): string =>
  getSegmentColorConfig(type).css

/** Classes for a pill in the segment's color, with text that stays readable on it. */
export const getSegmentChipClass = (
  type: MediaSegmentType | undefined,
): string => {
  const { bg, fg } = getSegmentColorConfig(type)
  return `inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium shadow-sm ${bg} ${fg}`
}

/**
 * A segment mapped to percent-based track coordinates for timeline rendering.
 * Shared by the player scrubber and the read-only episode-list timeline.
 */
export interface SegmentRegion {
  id: Segment['id']
  type: Segment['type']
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
 * Maps segments onto percent-based track regions.
 * Segments outside [0, duration] are clamped; degenerate spans are dropped.
 */
export const getSegmentRegions = (
  segments: Array<Segment> | undefined,
  duration: number,
  options?: SegmentRegionOptions,
): Array<SegmentRegion> => {
  if (!segments || segments.length === 0 || duration <= 0) return []

  const minVisibleWidth = options?.minVisibleWidthPercent
  const regions: Array<SegmentRegion> = []
  for (const segment of segments) {
    const { startSeconds, endSeconds } = segment
    const startPercent = (startSeconds / duration) * 100
    if (startPercent >= 100) continue
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
      id: segment.id,
      type: segment.type,
      start: left,
      width,
      color: getSegmentColorConfig(segment.type).css,
      startSeconds: Math.max(0, Math.min(startSeconds, duration)),
      endSeconds: Math.max(0, Math.min(endSeconds, duration)),
    })
  }
  return regions
}

/**
 * The Web Crypto members this module needs. `randomUUID` is gated on a secure
 * context, so the DOM lib type over-promises it on plain-HTTP origins;
 * `getRandomValues` carries no such gate but `globalThis.crypto` itself is
 * absent in some non-browser runtimes. Both the object and each member are
 * therefore checked before use.
 */
type OptionalCrypto = Partial<Pick<Crypto, 'getRandomValues' | 'randomUUID'>>

export const generateUUID = (): string => {
  // `typeof` rather than `'crypto' in globalThis`: embedded webviews and older
  // runtimes leave the property declared and undefined, a state `in` reports
  // as available even though every member read off it would then throw.
  const cryptoApi: OptionalCrypto =
    typeof globalThis.crypto === 'object' ? globalThis.crypto : {}

  if (cryptoApi.randomUUID) {
    return cryptoApi.randomUUID()
  }

  if (cryptoApi.getRandomValues) {
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
