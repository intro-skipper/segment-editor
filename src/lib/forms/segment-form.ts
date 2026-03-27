import { z } from 'zod'

import type { ValidationResult } from '@/types/segment'
import type { MediaSegmentDto, MediaSegmentType } from '@/types/jellyfin'
import { SEGMENT_TYPES } from '@/lib/constants'

const SEGMENT_TIME_TEXT_REGEX = /^-?[\d:.eE+\- ]+$/
const MAX_DECIMALS = 3
const TIME_MULTIPLIERS = [1, 60, 3600] as const

interface SegmentFormValues {
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

interface SegmentTimeParseResult {
  ok: boolean
  message?: string
  value?: number
}

export function formatSegmentInputSeconds(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  return value.toFixed(MAX_DECIMALS).replace(/\.?0+$/, '')
}

export function getSegmentFormDefaults(
  segment: Pick<MediaSegmentDto, 'Type' | 'StartTicks' | 'EndTicks'>,
): SegmentFormValues {
  return {
    type: segment.Type ?? 'Unknown',
    startText: formatSegmentInputSeconds(segment.StartTicks ?? 0),
    endText: formatSegmentInputSeconds(segment.EndTicks ?? 0),
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
    return sum + parsed * TIME_MULTIPLIERS[index]
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
    startSeconds: start.ok
      ? (start.value ?? fallback.startSeconds)
      : fallback.startSeconds,
    endSeconds: end.ok
      ? (end.value ?? fallback.endSeconds)
      : fallback.endSeconds,
  }
}

function getSegmentBoundaryError(
  startSeconds: number,
  endSeconds: number,
  maxDuration?: number | null,
): string | null {
  if (startSeconds < 0) return 'Start time cannot be negative'
  if (endSeconds < 0) return 'End time cannot be negative'
  if (startSeconds >= endSeconds) return 'Start time must be less than end time'
  if (
    typeof maxDuration === 'number' &&
    maxDuration > 0 &&
    endSeconds > maxDuration
  ) {
    return 'End time exceeds media duration'
  }
  return null
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
          message: start.message ?? getNumericFieldMessage('startText'),
        })
      }

      if (!end.ok) {
        ctx.addIssue({
          code: 'custom',
          path: ['endText'],
          message: end.message ?? getNumericFieldMessage('endText'),
        })
      }

      if (!start.ok || !end.ok) return

      const boundaryError = getSegmentBoundaryError(
        start.value ?? 0,
        end.value ?? 0,
        maxDuration,
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

function safeParseSegmentFormValues(
  values: SegmentFormValues,
  maxDuration?: number | null,
) {
  return createSegmentFormSchema(maxDuration).safeParse(values)
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
  segment: MediaSegmentDto,
  values: SegmentFormValues,
  maxDuration?: number | null,
):
  | {
      success: true
      segment: MediaSegmentDto
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
      Type: parsed.data.type,
      StartTicks: parsed.data.startSeconds,
      EndTicks: parsed.data.endSeconds,
    },
    validation: { valid: true },
  }
}
