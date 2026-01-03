import {
  DEFAULT_SEGMENT_COLOR,
  SEGMENT_COLORS,
  SEGMENT_TYPES,
} from './constants'
import { toSafeNumber } from './time-utils'
import type { MediaSegmentDto, MediaSegmentType } from '@/types/jellyfin'
import type { ValidationResult } from '@/types/segment'

export { SEGMENT_TYPES }

export const sortSegmentsByStart = (
  a: MediaSegmentDto,
  b: MediaSegmentDto,
): number => (a.StartTicks ?? 0) - (b.StartTicks ?? 0)

export const getSegmentColor = (type: MediaSegmentType | undefined): string =>
  (type && SEGMENT_COLORS[type].bg) ?? DEFAULT_SEGMENT_COLOR.bg

export const getSegmentCssVar = (type: MediaSegmentType | undefined): string =>
  (type && SEGMENT_COLORS[type].css) ?? DEFAULT_SEGMENT_COLOR.css

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const generateUUID = (): string => crypto.randomUUID()

export const isValidUUID = (uuid: string | null | undefined): boolean =>
  typeof uuid === 'string' && UUID_V4.test(uuid)

/** Valid segment types whitelist for security validation */
const VALID_SEGMENT_TYPES = new Set<string>(SEGMENT_TYPES)

/** Validates that a segment type is a known valid type */
export const isValidSegmentType = (type: unknown): type is MediaSegmentType =>
  typeof type === 'string' && VALID_SEGMENT_TYPES.has(type)

/** Creates an invalid validation result with the given error message */
const invalid = (error: string): ValidationResult => ({ valid: false, error })

/** Validates segment type against whitelist */
function validateSegmentType(
  type: MediaSegmentType | undefined,
): string | null {
  if (type && !isValidSegmentType(type)) return 'Invalid segment type'
  return null
}

/** Validates that tick values are finite numbers */
function validateTicksAreFinite(
  startTicks: number | null | undefined,
  endTicks: number | null | undefined,
): string | null {
  if (startTicks != null && !Number.isFinite(startTicks))
    return 'Start time must be a valid number'
  if (endTicks != null && !Number.isFinite(endTicks))
    return 'End time must be a valid number'
  return null
}

/** Validates time boundaries (non-negative, start < end, within duration) */
function validateTimeBoundaries(
  start: number,
  end: number,
  maxDuration: number,
): string | null {
  if (start < 0) return 'Start time cannot be negative'
  if (end < 0) return 'End time cannot be negative'
  if (start >= end) return 'Start time must be less than end time'
  if (maxDuration > 0 && end > maxDuration)
    return 'End time exceeds media duration'
  return null
}

export function validateSegment(
  segment: MediaSegmentDto | null | undefined,
  maxDuration?: number | null,
): ValidationResult {
  if (!segment) return invalid('Segment is required')

  const { StartTicks, EndTicks, Type } = segment

  // Run validation checks in sequence, return first error
  const typeError = validateSegmentType(Type)
  if (typeError) return invalid(typeError)

  const finiteError = validateTicksAreFinite(StartTicks, EndTicks)
  if (finiteError) return invalid(finiteError)

  const boundaryError = validateTimeBoundaries(
    toSafeNumber(StartTicks),
    toSafeNumber(EndTicks),
    toSafeNumber(maxDuration),
  )
  if (boundaryError) return invalid(boundaryError)

  return { valid: true }
}
