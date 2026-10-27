import { z } from 'zod'

import type { Segment, ValidationResult } from '@/types/segment'
import type { MediaSegmentType } from '@/types/jellyfin'
import { SEGMENT_TYPES } from '@/lib/constants'
import { maxEndSeconds, rangeError } from '@/lib/segment-range'

const SEGMENT_TIME_TEXT_REGEX = /^-?[\d:.eE+\- ]+$/
const MAX_DECIMALS = 3
const TIME_MULTIPLIERS = [1, 60, 3600] as const

export interface SegmentFormValues {
  type: MediaSegmentType
  startText: string
  endText: string
}

interface SegmentFormParsedValues {
  type: MediaSegmentType
  startSeconds: number
  endSeconds: number
}

interface SegmentDraftRange {
  startSeconds: number
  endSeconds: number
}

interface SegmentDraftState {
  draftRange: SegmentDraftRange
  validation: ValidationResult
}

type SegmentTimeField = 'startText' | 'endText'

type SegmentTimeParseResult =
  | { ok: true; value: number }
  | { ok: false; message: string }

export function formatSegmentInputSeconds(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  return value.toFixed(MAX_DECIMALS).replace(/\.?0+$/, '')
}

/** The valid range for a segment's time fields; max is Infinity when the media duration is unknown. */
export interface SegmentTimeBounds {
  min: 0
  max: number
}

export function getSegmentTimeBounds(
  maxDuration?: number | null,
): SegmentTimeBounds {
  return { min: 0, max: maxEndSeconds({ runtimeSeconds: maxDuration ?? 0 }) }
}

/**
 * Attempts to parse a time text value and clamp it to [min, max].
 * Returns the formatted clamped value if clamping was needed, or null if the
 * value is already in bounds or unparseable (no change required).
 */
export function clampTimeText(
  value: string,
  min: number,
  max: number,
): string | null {
  const trimmed = value.trim()
  if (!SEGMENT_TIME_TEXT_REGEX.test(trimmed)) return null
  const parsed = parseUncheckedTimeText(trimmed)
  if (!Number.isFinite(parsed)) return null
  if (parsed < min) return formatSegmentInputSeconds(min)
  if (parsed > max) return formatSegmentInputSeconds(max)
  return null
}

export function getSegmentFormDefaults(
  segment: Pick<Segment, 'type' | 'startSeconds' | 'endSeconds'>,
): SegmentFormValues {
  return {
    type: segment.type ?? 'Unknown',
    startText: formatSegmentInputSeconds(segment.startSeconds),
    endText: formatSegmentInputSeconds(segment.endSeconds),
  }
}

function getTimeFieldLabel(field: SegmentTimeField): string {
  return field === 'startText' ? 'Start' : 'End'
}

function getNumericFieldMessage(field: SegmentTimeField): string {
  return `${getTimeFieldLabel(field)} time must be a valid number`
}

function parseUncheckedTimeText(value: string): number {
  const delimiter = value.includes(':') ? ':' : ' '
  const parts = value.split(delimiter).filter(Boolean)
  if (parts.length > TIME_MULTIPLIERS.length) return Number.NaN
  return parts.reverse().reduce((sum, part, index) => {
    const parsed = Number(part)
    if (!Number.isFinite(parsed)) return Number.NaN
    const multiplier = TIME_MULTIPLIERS[index]
    return sum + parsed * multiplier
  }, 0)
}

function parseSegmentTimeText(
  field: SegmentTimeField,
  value: string,
): SegmentTimeParseResult {
  const trimmed = value.trim()
  if (!trimmed) {
    return {
      ok: false,
      message: getNumericFieldMessage(field),
    }
  }

  if (!SEGMENT_TIME_TEXT_REGEX.test(trimmed)) {
    return {
      ok: false,
      message: getNumericFieldMessage(field),
    }
  }

  const parsed = parseUncheckedTimeText(trimmed)
  if (!Number.isFinite(parsed)) {
    return {
      ok: false,
      message: getNumericFieldMessage(field),
    }
  }

  return {
    ok: true,
    value: parsed,
  }
}

function getSegmentDraftRange(
  values: SegmentFormValues,
  fallback: SegmentDraftRange,
): SegmentDraftRange {
  const start = parseSegmentTimeText('startText', values.startText)
  const end = parseSegmentTimeText('endText', values.endText)

  return {
    startSeconds: start.ok ? start.value : fallback.startSeconds,
    endSeconds: end.ok ? end.value : fallback.endSeconds,
  }
}

export function createSegmentFormSchema(maxDuration?: number | null) {
  return z
    .object({
      type: z.enum(SEGMENT_TYPES),
      startText: z.string(),
      endText: z.string(),
    })
    .superRefine((value, ctx) => {
      const start = parseSegmentTimeText('startText', value.startText)
      const end = parseSegmentTimeText('endText', value.endText)

      if (!start.ok) {
        ctx.addIssue({
          code: 'custom',
          path: ['startText'],
          message: start.message,
        })
      }

      if (!end.ok) {
        ctx.addIssue({
          code: 'custom',
          path: ['endText'],
          message: end.message,
        })
      }

      if (!start.ok || !end.ok) return

      const boundaryError = rangeError(
        { start: start.value, end: end.value },
        { runtimeSeconds: maxDuration ?? 0 },
      )

      if (!boundaryError) return

      const path: Array<SegmentTimeField> =
        boundaryError === 'Start time must be less than end time' ||
        boundaryError === 'Start time cannot be negative'
          ? ['startText']
          : ['endText']

      ctx.addIssue({
        code: 'custom',
        path,
        message: boundaryError,
      })
    })
}

// Every row validates on each keystroke and render against the same media
// duration, so keep the schema built for the last duration instead of
// rebuilding it per call. Keyed by the normalized bound so NaN, null and
// undefined all share the unbounded schema.
let lastSchema: {
  max: number
  schema: ReturnType<typeof createSegmentFormSchema>
} | null = null

function safeParseSegmentFormValues(
  values: SegmentFormValues,
  maxDuration?: number | null,
) {
  const { max } = getSegmentTimeBounds(maxDuration)
  if (lastSchema?.max !== max) {
    lastSchema = { max, schema: createSegmentFormSchema(max) }
  }
  return lastSchema.schema.safeParse(values)
}

export function validateSegmentFormValues(
  values: SegmentFormValues,
  maxDuration?: number | null,
): ValidationResult {
  const result = safeParseSegmentFormValues(values, maxDuration)
  if (result.success) return { valid: true }

  return {
    valid: false,
    error: result.error.issues[0]?.message ?? 'Invalid segment',
  }
}

export function getSegmentDraftState(
  values: SegmentFormValues,
  fallback: SegmentDraftRange,
  maxDuration?: number | null,
): SegmentDraftState {
  return {
    draftRange: getSegmentDraftRange(values, fallback),
    validation: validateSegmentFormValues(values, maxDuration),
  }
}

function parseSegmentFormValues(
  values: SegmentFormValues,
  maxDuration?: number | null,
):
  | {
      success: true
      data: SegmentFormParsedValues
    }
  | {
      success: false
      validation: ValidationResult
    } {
  const result = safeParseSegmentFormValues(values, maxDuration)
  if (!result.success) {
    return {
      success: false,
      validation: {
        valid: false,
        error: result.error.issues[0]?.message ?? 'Invalid segment',
      },
    }
  }

  return {
    success: true,
    data: {
      type: result.data.type,
      startSeconds: parseUncheckedTimeText(result.data.startText.trim()),
      endSeconds: parseUncheckedTimeText(result.data.endText.trim()),
    },
  }
}

export function buildSegmentFromFormValues(
  segment: Segment,
  values: SegmentFormValues,
  maxDuration?: number | null,
):
  | {
      success: true
      segment: Segment
      validation: ValidationResult
    }
  | {
      success: false
      validation: ValidationResult
    } {
  const parsed = parseSegmentFormValues(values, maxDuration)
  if (!parsed.success) return parsed

  return {
    success: true,
    segment: {
      ...segment,
      type: parsed.data.type,
      startSeconds: parsed.data.startSeconds,
      endSeconds: parsed.data.endSeconds,
    },
    validation: { valid: true },
  }
}
