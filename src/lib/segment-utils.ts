import type { MediaSegmentDto, MediaSegmentType } from '@/types/jellyfin'
import type { ValidationResult } from '@/types/segment'

/**
 * Comparator function to sort segments by start time.
 * @param a - First segment
 * @param b - Second segment
 * @returns Negative if a < b, positive if a > b, zero if equal
 */
export function sortSegmentsByStart(
  a: MediaSegmentDto,
  b: MediaSegmentDto,
): number {
  const startA = a.StartTicks ?? 0
  const startB = b.StartTicks ?? 0

  if (startA < startB) return -1
  if (startA > startB) return 1
  return 0
}

/**
 * Segment color CSS variable mapping.
 * Uses CSS custom properties for consistent theming across light/dark modes.
 */
const SEGMENT_COLOR_VARS: Record<string, string> = {
  Intro: 'var(--segment-intro)',
  Outro: 'var(--segment-outro)',
  Preview: 'var(--segment-preview)',
  Recap: 'var(--segment-recap)',
  Commercial: 'var(--segment-commercial)',
  Unknown: 'var(--segment-unknown)',
} as const

/**
 * Returns a Tailwind CSS color class for a segment type.
 * Uses CSS variables for consistent theming.
 * @param type - The segment type
 * @returns Tailwind color class name
 */
export function getSegmentColor(type: MediaSegmentType | undefined): string {
  switch (type) {
    case 'Intro':
      return 'bg-segment-intro'
    case 'Outro':
      return 'bg-segment-outro'
    case 'Preview':
      return 'bg-segment-preview'
    case 'Recap':
      return 'bg-segment-recap'
    case 'Commercial':
      return 'bg-segment-commercial'
    case 'Unknown':
    default:
      return 'bg-segment-unknown'
  }
}

/**
 * Returns a CSS variable for a segment type color.
 * Use this for inline styles where Tailwind classes aren't applicable.
 * @param type - The segment type
 * @returns CSS variable string (e.g., 'var(--segment-intro)')
 */
export function getSegmentCssVar(type: MediaSegmentType | undefined): string {
  return SEGMENT_COLOR_VARS[type ?? 'Unknown'] ?? SEGMENT_COLOR_VARS.Unknown
}

/**
 * Returns a hex color for a segment type (for canvas/non-Tailwind use).
 * Note: These are fallback values; prefer getSegmentCssVar for theme support.
 * @param type - The segment type
 * @returns Hex color string
 * @deprecated Use getSegmentCssVar for better theme support
 */
export function getSegmentHexColor(type: MediaSegmentType | undefined): string {
  switch (type) {
    case 'Intro':
      return '#22c55e' // green-500
    case 'Outro':
      return '#a855f7' // purple-500
    case 'Preview':
      return '#a3e635' // lime-400
    case 'Recap':
      return '#eab308' // yellow-500
    case 'Commercial':
      return '#ef4444' // red-500
    case 'Unknown':
    default:
      return '#6b7280' // gray-500
  }
}

/**
 * Generates a UUID v4 string.
 * Uses crypto.randomUUID if available, falls back to manual generation.
 * @returns UUID string
 */
export function generateUUID(): string {
  // Use native crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  // Fallback implementation for older environments
  let d = Date.now()
  let d2 = 0
  if (typeof performance !== 'undefined' && 'now' in performance) {
    d2 = performance.now() * 1000
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    let r = Math.random() * 16
    if (d > 0) {
      r = ((d + r) % 16) | 0
      d = Math.floor(d / 16)
    } else {
      r = ((d2 + r) % 16) | 0
      d2 = Math.floor(d2 / 16)
    }
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/**
 * Validates if a string is a valid UUID v4 format.
 * @param uuid - String to validate
 * @returns True if valid UUID v4 format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

/**
 * Validates a segment's boundaries.
 * @param segment - The segment to validate
 * @returns Validation result with valid flag and optional error message
 */
export function validateSegment(segment: MediaSegmentDto): ValidationResult {
  const start = segment.StartTicks ?? 0
  const end = segment.EndTicks ?? 0

  if (start < 0) {
    return {
      valid: false,
      error: 'Start time cannot be negative',
    }
  }

  if (end < 0) {
    return {
      valid: false,
      error: 'End time cannot be negative',
    }
  }

  if (start >= end) {
    return {
      valid: false,
      error: 'Start time must be less than end time',
    }
  }

  return { valid: true }
}

/**
 * Validates segment boundaries with a maximum duration constraint.
 * @param segment - The segment to validate
 * @param maxDuration - Maximum allowed duration (in same units as segment ticks)
 * @returns Validation result with valid flag and optional error message
 */
export function validateSegmentWithDuration(
  segment: MediaSegmentDto,
  maxDuration: number,
): ValidationResult {
  const baseValidation = validateSegment(segment)
  if (!baseValidation.valid) {
    return baseValidation
  }

  const end = segment.EndTicks ?? 0

  if (end > maxDuration) {
    return {
      valid: false,
      error: 'End time exceeds media duration',
    }
  }

  return { valid: true }
}

/**
 * All available segment types.
 */
export const SEGMENT_TYPES: Array<MediaSegmentType> = [
  'Intro',
  'Outro',
  'Preview',
  'Recap',
  'Commercial',
  'Unknown',
]
