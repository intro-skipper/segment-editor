/**
 * Intro Skipper (external JSON) import helpers.
 *
 * Supports clipboard JSON payloads shaped like:
 * {
 *   "events": [
 *     { "startTimeMs": 7000, "endTimeMs": 120000, "eventType": "SKIP_RECAP" }
 *   ]
 * }
 */

import { z } from 'zod'

import { lookup } from '@/lib/utils'

import type { MediaSegmentDto, MediaSegmentType } from '@/types/jellyfin'
import {
  getSegmentFormDefaults,
  validateSegmentFormValues,
} from '@/lib/forms/segment-form'
import { generateUUID, sortSegmentsByStart } from '@/lib/segment-utils'

type IntroSkipperEventType = 'SKIP_INTRO' | 'SKIP_RECAP' | 'END_CREDITS'

type IntroSkipperExportEventType = 'Intro' | 'Recap' | 'Outro'

/** An undecoded node of the clipboard JSON tree. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | Array<JsonValue>
  | JsonRecord

interface JsonRecord {
  [key: string]: JsonValue
}

/** True when a JSON node is an object, the only shape worth descending into. */
const isJsonRecord = (value: JsonValue): value is JsonRecord =>
  value !== null && !Array.isArray(value) && value instanceof Object

/**
 * A single plugin event. Every field falls back to undefined instead of
 * failing the event, so one malformed timing skips just that entry — matching
 * how exporters emit partial records.
 */
const IntroSkipperEventSchema = z.object({
  startTimeMs: z.number().finite().optional().catch(undefined),
  endTimeMs: z.number().finite().optional().catch(undefined),
  eventType: z.string().optional().catch(undefined),
})

type IntroSkipperEvent = z.infer<typeof IntroSkipperEventSchema>

const SecondsBasedMarkerSchema = z.object({
  start: z.number().finite().optional().catch(undefined),
  end: z.number().finite().optional().catch(undefined),
})

/** The alternative payload keyed by marker name rather than an event list. */
const SecondsBasedMarkersSchema = z
  .object({
    intro: SecondsBasedMarkerSchema.optional().catch(undefined),
    recap: SecondsBasedMarkerSchema.optional().catch(undefined),
    credits: SecondsBasedMarkerSchema.optional().catch(undefined),
    preview: SecondsBasedMarkerSchema.optional().catch(undefined),
  })
  .catch({})

type SecondsBasedMarker = z.infer<typeof SecondsBasedMarkerSchema>

/** Marker names that mark a payload as seconds-based rather than event-based. */
const MARKER_KEYS = ['intro', 'credits', 'preview', 'recap'] as const

/**
 * Exporters wrap the event list at varying depths; cap the descent. Arrays
 * spend a level of their own during the search, so the cap is set at twice the
 * deepest object nesting worth supporting.
 */
const MAX_SEARCH_DEPTH = 24

interface IntroSkipperImportOptions {
  itemId: string
  /** Runtime of the item, used to close out open-ended credits markers. */
  maxDurationSeconds?: number
}

/** Outcome of decoding one clipboard payload into importable segments. */
interface IntroSkipperImportResult {
  segments: Array<MediaSegmentDto>
  skipped: number
  /** Event types the payload used that this importer does not recognise. */
  unknownTypes: Array<string>
  error?: string
}

interface IntroSkipperExportEvent {
  startTimeMs: number
  endTimeMs?: number
  eventType: IntroSkipperExportEventType
}

type IntroSkipperExportPayload = Array<IntroSkipperExportEvent>

const EVENT_TYPE_TO_SEGMENT_TYPE = {
  SKIP_INTRO: 'Intro',
  SKIP_RECAP: 'Recap',
  END_CREDITS: 'Outro',
} satisfies Record<IntroSkipperEventType, MediaSegmentType>

/** True for a duration the caller actually knows. */
const isUsableDuration = (seconds: number | undefined): seconds is number =>
  seconds !== undefined && Number.isFinite(seconds) && seconds > 0

const msToSeconds = (ms: number): number => ms / 1000
const secondsToMs = (seconds: number): number => Math.round(seconds * 1000)

const getEventTimingMs = (
  event: IntroSkipperEvent,
  options?: {
    eventType?: string
    maxDurationSeconds?: number
  },
): { startMs: number; endMs: number } | null => {
  // Intentionally ignore `intervals` for import.
  const startMs = event.startTimeMs
  if (startMs === undefined) return null

  const endMs = event.endTimeMs

  // END_CREDITS typically runs until media end; if duration is known, use it.
  if (endMs === undefined) {
    const normalizedType = options?.eventType?.trim().toUpperCase() ?? ''
    const maxDurationSeconds = options?.maxDurationSeconds

    if (
      normalizedType === 'END_CREDITS' &&
      isUsableDuration(maxDurationSeconds)
    ) {
      return { startMs, endMs: maxDurationSeconds * 1000 }
    }

    return { startMs, endMs: startMs + 1000 }
  }

  return { startMs, endMs }
}

const getEventSegmentType = (
  eventType: string | undefined,
): MediaSegmentType | null => {
  if (eventType === undefined) return null
  const normalized = eventType.trim().toUpperCase()

  // Support importing both Intro Skipper event types and MediaSegmentType strings
  if (normalized === 'INTRO') return 'Intro'
  if (normalized === 'RECAP') return 'Recap'
  if (normalized === 'OUTRO') return 'Outro'

  return lookup(EVENT_TYPE_TO_SEGMENT_TYPE, normalized) ?? null
}

const looksLikeSingleEventObject = (value: JsonRecord): boolean =>
  'startTimeMs' in value || 'endTimeMs' in value || 'eventType' in value

/** Finds the first `events` array anywhere in the payload, depth-first. */
const findNestedEventsArray = (
  value: JsonValue,
  depth = 0,
): Array<JsonValue> | null => {
  if (depth > MAX_SEARCH_DEPTH) return null

  // An array holds no `events` key of its own, but its elements may.
  if (Array.isArray(value)) {
    for (const element of value) {
      const found = findNestedEventsArray(element, depth + 1)
      if (found) return found
    }
    return null
  }

  if (!isJsonRecord(value)) return null

  const direct = value.events
  if (Array.isArray(direct)) return direct

  for (const child of Object.values(value)) {
    const found = findNestedEventsArray(child, depth + 1)
    if (found) return found
  }

  return null
}

/**
 * Converts clipboard JSON text (Intro Skipper style) into UI segments.
 *
 * Note: In this app, `StartTicks`/`EndTicks` represent UI seconds (boundary layer
 * converts to Jellyfin ticks when saving).
 */
export function introSkipperClipboardTextToSegments(
  text: string,
  options: IntroSkipperImportOptions,
): IntroSkipperImportResult {
  if (!text.trim())
    return {
      segments: [],
      skipped: 0,
      unknownTypes: [],
      error: 'Clipboard is empty',
    }

  let parsed: JsonValue
  try {
    parsed = JSON.parse(text)
  } catch {
    return {
      segments: [],
      skipped: 0,
      unknownTypes: [],
      error: 'Clipboard is not valid JSON',
    }
  }

  // Alternative format: seconds-based markers object
  // Example:
  // { "intro": {"start": 392, "end": 483}, "credits": {"start": 1331, "end": 1422}, "preview": {...} }
  if (isJsonRecord(parsed)) {
    if (MARKER_KEYS.some((key) => key in parsed)) {
      // Decoding a record cannot reject: `.catch` on the schema itself, and on
      // every field, guarantees a value. Gating the branch on the decode
      // instead would silently reroute a marker payload to the event path.
      const markers = SecondsBasedMarkersSchema.parse(parsed)
      const markerToSegment = (
        marker: SecondsBasedMarker | undefined,
        type: MediaSegmentType,
      ): MediaSegmentDto | null => {
        if (!marker) return null

        const startSeconds = marker.start
        if (startSeconds === undefined) return null

        const endSeconds =
          marker.end ??
          (type === 'Outro' && isUsableDuration(options.maxDurationSeconds)
            ? options.maxDurationSeconds
            : startSeconds + 1)

        const segment: MediaSegmentDto = {
          Id: generateUUID(),
          ItemId: options.itemId,
          Type: type,
          StartTicks: startSeconds,
          EndTicks: endSeconds,
        }

        if (!isValidImportedSegment(segment, options.maxDurationSeconds)) {
          return null
        }
        return segment
      }

      const candidates: Array<MediaSegmentDto | null> = [
        markerToSegment(markers.recap, 'Recap'),
        markerToSegment(markers.intro, 'Intro'),
        markerToSegment(markers.credits, 'Outro'),
        markerToSegment(markers.preview, 'Preview'),
      ]

      const segments = candidates.filter((entry) => entry !== null)
      const skipped = candidates.length - segments.length

      return {
        segments: segments.sort(sortSegmentsByStart),
        skipped,
        unknownTypes: [],
        error:
          segments.length === 0 ? 'No importable markers found' : undefined,
      }
    }
  }

  // `events` is optional: accept wrapper object, raw array, or a single event object
  const eventNodes: Array<JsonValue> | null = Array.isArray(parsed)
    ? parsed
    : isJsonRecord(parsed)
      ? (findNestedEventsArray(parsed) ??
        (looksLikeSingleEventObject(parsed) ? [parsed] : null))
      : null

  if (!eventNodes) {
    return {
      segments: [],
      skipped: 0,
      unknownTypes: [],
      error: 'Clipboard JSON has no events',
    }
  }

  const segments: Array<MediaSegmentDto> = []
  const unknownTypesSet = new Set<string>()
  let skipped = 0

  for (const node of eventNodes) {
    const decoded = IntroSkipperEventSchema.safeParse(node)
    if (!decoded.success) {
      skipped += 1
      continue
    }

    const event = decoded.data
    const type = getEventSegmentType(event.eventType)
    const timing = getEventTimingMs(event, {
      eventType: event.eventType,
      maxDurationSeconds: options.maxDurationSeconds,
    })

    if (!type) {
      skipped += 1
      // Track unknown event types for user feedback
      const rawType = event.eventType?.trim()
      if (rawType) unknownTypesSet.add(rawType)
      continue
    }

    if (!timing) {
      skipped += 1
      continue
    }

    const segment: MediaSegmentDto = {
      Id: generateUUID(),
      ItemId: options.itemId,
      Type: type,
      StartTicks: msToSeconds(timing.startMs),
      EndTicks: msToSeconds(timing.endMs),
    }

    if (!isValidImportedSegment(segment, options.maxDurationSeconds)) {
      skipped += 1
      continue
    }

    segments.push(segment)
  }

  return {
    segments: segments.sort(sortSegmentsByStart),
    skipped,
    unknownTypes: [...unknownTypesSet],
    error: segments.length === 0 ? 'No importable events found' : undefined,
  }
}

const toExportEventTypeForSegment = (
  type: MediaSegmentType | null | undefined,
): IntroSkipperExportEventType | null => {
  if (type === 'Intro') return 'Intro'
  if (type === 'Recap') return 'Recap'
  if (type === 'Outro') return 'Outro'
  return null
}

interface IntroSkipperExportResult {
  payload: IntroSkipperExportPayload
  excludedTypes: Array<MediaSegmentType>
  excludedCount: number
}

function isValidImportedSegment(
  segment: MediaSegmentDto,
  maxDurationSeconds?: number,
): boolean {
  return validateSegmentFormValues(
    getSegmentFormDefaults({
      Type: segment.Type,
      StartTicks: segment.StartTicks,
      EndTicks: segment.EndTicks,
    }),
    maxDurationSeconds,
  ).valid
}

/**
 * Converts current UI segments into an Intro Skipper JSON payload.
 *
 * - Only exports: Intro, Recap, Outro
 * - Ignores: Preview, Commercial, Unknown
 * - END_CREDITS omits endTimeMs (it is assumed to run to the end)
 *
 * Returns the payload along with information about excluded segments.
 */
export function segmentsToIntroSkipperPayload(
  segments: Array<MediaSegmentDto>,
): IntroSkipperExportResult {
  const sorted = segments.toSorted(sortSegmentsByStart)
  const events: Array<IntroSkipperExportEvent> = []
  const excludedTypesSet = new Set<MediaSegmentType>()
  let excludedCount = 0

  for (const segment of sorted) {
    const eventType = toExportEventTypeForSegment(segment.Type)
    if (!eventType) {
      excludedCount += 1
      if (segment.Type) {
        excludedTypesSet.add(segment.Type)
      }
      continue
    }

    const startTimeMs = secondsToMs(segment.StartTicks ?? 0)

    if (eventType === 'Outro') {
      events.push({
        startTimeMs,
        eventType,
      })
      continue
    }

    const endTimeMs = secondsToMs(segment.EndTicks ?? 0)
    events.push({
      startTimeMs,
      endTimeMs,
      eventType,
    })
  }

  return {
    payload: events,
    excludedTypes: [...excludedTypesSet],
    excludedCount,
  }
}

interface IntroSkipperClipboardResult {
  text: string
  excludedTypes: Array<MediaSegmentType>
  excludedCount: number
}

/**
 * Creates clipboard-ready JSON text for Intro Skipper.
 * Uses tab indentation to match typical clipboard snippets.
 *
 * Returns the JSON text along with information about excluded segments.
 */
export function segmentsToIntroSkipperClipboardText(
  segments: Array<MediaSegmentDto>,
): IntroSkipperClipboardResult {
  const result = segmentsToIntroSkipperPayload(segments)
  return {
    text: JSON.stringify(result.payload, null, '\t'),
    excludedTypes: result.excludedTypes,
    excludedCount: result.excludedCount,
  }
}
