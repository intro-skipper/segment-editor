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

/**
 * Compares two segment lists for equality by length and per-segment
 * Id/Type/StartTicks/EndTicks in order. Missing elements (sparse arrays or
 * explicit undefined entries) are treated as unequal.
 */
export const areSegmentListsEqual = (
  a: ReadonlyArray<MediaSegmentDto>,
  b: ReadonlyArray<MediaSegmentDto>,
): boolean =>
  a.length === b.length &&
  Array.from(a, (segment, index) => {
    const other = b[index] as MediaSegmentDto | undefined
    return (
      segment !== undefined &&
      other !== undefined &&
      segment.Id === other.Id &&
      segment.Type === other.Type &&
      segment.StartTicks === other.StartTicks &&
      segment.EndTicks === other.EndTicks
    )
  }).every(Boolean)

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

export const getSegmentColor = (type: MediaSegmentType | undefined): string =>
  (type && SEGMENT_COLORS[type].bg) ?? DEFAULT_SEGMENT_COLOR.bg

export const getSegmentCssVar = (type: MediaSegmentType | undefined): string =>
  (type && SEGMENT_COLORS[type].css) ?? DEFAULT_SEGMENT_COLOR.css

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
