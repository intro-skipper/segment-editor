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

import type { MediaSegmentDto, MediaSegmentType } from '@/types/jellyfin'
import {
  generateUUID,
  sortSegmentsByStart,
  validateSegment,
} from '@/lib/segment-utils'

type IntroSkipperEventType = 'SKIP_INTRO' | 'SKIP_RECAP' | 'END_CREDITS'

type IntroSkipperExportEventType = 'Intro' | 'Recap' | 'Outro'

interface IntroSkipperInterval {
  startTimeMs?: number
  endTimeMs?: number
}

interface IntroSkipperEvent {
  startTimeMs?: number
  endTimeMs?: number
  eventType?: string
  intervals?: Array<IntroSkipperInterval>
}

interface IntroSkipperPayload {
  events?: Array<IntroSkipperEvent>
}

interface SecondsBasedMarker {
  start?: number
  end?: number
  type?: string
}

interface SecondsBasedMarkersPayload {
  intro?: SecondsBasedMarker
  recap?: SecondsBasedMarker
  credits?: SecondsBasedMarker
  preview?: SecondsBasedMarker
  [key: string]: unknown
}

interface IntroSkipperExportEvent {
  startTimeMs: number
  endTimeMs?: number
  eventType: IntroSkipperExportEventType
}

type IntroSkipperExportPayload = Array<IntroSkipperExportEvent>

const EVENT_TYPE_TO_SEGMENT_TYPE: Record<
  IntroSkipperEventType,
  MediaSegmentType
> = {
  SKIP_INTRO: 'Intro',
  SKIP_RECAP: 'Recap',
  END_CREDITS: 'Outro',
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const msToSeconds = (ms: number): number => ms / 1000
const secondsToMs = (seconds: number): number => Math.round(seconds * 1000)

const getEventTimingMs = (
  event: IntroSkipperEvent,
  options?: {
    eventType?: unknown
    maxDurationSeconds?: number
  },
): { startMs: number; endMs: number } | null => {
  // Intentionally ignore `intervals` for import.
  const startMsRaw = event.startTimeMs
  if (!isNumber(startMsRaw)) return null

  const endMsRaw = event.endTimeMs

  // END_CREDITS typically runs until media end; if duration is known, use it.
  if (!isNumber(endMsRaw)) {
    const normalizedType =
      typeof options?.eventType === 'string'
        ? options.eventType.trim().toUpperCase()
        : ''
    const maxDurationSeconds = options?.maxDurationSeconds

    if (
      normalizedType === 'END_CREDITS' &&
      typeof maxDurationSeconds === 'number' &&
      Number.isFinite(maxDurationSeconds) &&
      maxDurationSeconds > 0
    ) {
      return { startMs: startMsRaw, endMs: maxDurationSeconds * 1000 }
    }

    return { startMs: startMsRaw, endMs: startMsRaw + 1000 }
  }

  return { startMs: startMsRaw, endMs: endMsRaw }
}

const getEventSegmentType = (eventType: unknown): MediaSegmentType | null => {
  if (typeof eventType !== 'string') return null
  const normalized = eventType.trim().toUpperCase()

  // Support importing both Intro Skipper event types and MediaSegmentType strings
  if (normalized === 'INTRO') return 'Intro'
  if (normalized === 'RECAP') return 'Recap'
  if (normalized === 'OUTRO') return 'Outro'

  if (normalized in EVENT_TYPE_TO_SEGMENT_TYPE) {
    return EVENT_TYPE_TO_SEGMENT_TYPE[normalized as IntroSkipperEventType]
  }

  return null
}

const looksLikeSingleEventObject = (value: unknown): boolean => {
  if (!isRecord(value)) return false
  return 'startTimeMs' in value || 'endTimeMs' in value || 'eventType' in value
}

const findNestedEventsArray = (
  value: unknown,
  options?: { maxDepth?: number; depth?: number },
): Array<IntroSkipperEvent> | null => {
  const maxDepth = options?.maxDepth ?? 12
  const depth = options?.depth ?? 0
  if (depth > maxDepth) return null

  if (!isRecord(value)) return null

  const direct = (value as IntroSkipperPayload).events
  if (Array.isArray(direct)) return direct

  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      // Recurse into array elements (in case objects are nested inside)
      for (const element of child) {
        const found = findNestedEventsArray(element, {
          maxDepth,
          depth: depth + 1,
        })
        if (found) return found
      }
      continue
    }

    if (isRecord(child)) {
      const found = findNestedEventsArray(child, { maxDepth, depth: depth + 1 })
      if (found) return found
    }
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
  options: {
    itemId: string
    maxDurationSeconds?: number
  },
): {
  segments: Array<MediaSegmentDto>
  skipped: number
  unknownTypes: Array<string>
  error?: string
} {
  if (!text.trim())
    return {
      segments: [],
      skipped: 0,
      unknownTypes: [],
      error: 'Clipboard is empty',
    }

  let parsed: unknown
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
  if (isRecord(parsed)) {
    const markers = parsed as SecondsBasedMarkersPayload
    const hasKnownKey =
      'intro' in markers ||
      'credits' in markers ||
      'preview' in markers ||
      'recap' in markers

    if (hasKnownKey) {
      const markerToSegment = (
        marker: SecondsBasedMarker | undefined,
        type: MediaSegmentType,
      ): MediaSegmentDto | null => {
        if (!marker) return null
        if (!isNumber(marker.start)) return null

        const startSeconds = marker.start
        const endSecondsRaw = marker.end
        const endSeconds = isNumber(endSecondsRaw)
          ? endSecondsRaw
          : type === 'Outro' &&
              typeof options.maxDurationSeconds === 'number' &&
              Number.isFinite(options.maxDurationSeconds) &&
              options.maxDurationSeconds > 0
            ? options.maxDurationSeconds
            : startSeconds + 1

        const segment: MediaSegmentDto = {
          Id: generateUUID(),
          ItemId: options.itemId,
          Type: type,
          StartTicks: startSeconds,
          EndTicks: endSeconds,
        }

        const validation = validateSegment(segment, options.maxDurationSeconds)
        if (!validation.valid) return null
        return segment
      }

      const candidates: Array<MediaSegmentDto | null> = [
        markerToSegment(markers.recap, 'Recap'),
        markerToSegment(markers.intro, 'Intro'),
        markerToSegment(markers.credits, 'Outro'),
        markerToSegment(markers.preview, 'Preview'),
      ]

      const segments = candidates.filter(Boolean) as Array<MediaSegmentDto>
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
  const events: Array<IntroSkipperEvent> | null = Array.isArray(parsed)
    ? (parsed as Array<IntroSkipperEvent>)
    : isRecord(parsed)
      ? (findNestedEventsArray(parsed) ??
        (looksLikeSingleEventObject(parsed)
          ? ([parsed as IntroSkipperEvent] as Array<IntroSkipperEvent>)
          : null))
      : null

  if (!events) {
    return {
      segments: [],
      skipped: 0,
      unknownTypes: [],
      error: 'Clipboard JSON has no events',
    }
  }

  const segments: Array<MediaSegmentDto> = []
  const unknownTypes: Array<string> = []
  let skipped = 0

  for (const event of events) {
    const type = getEventSegmentType(event.eventType)
    const timing = getEventTimingMs(event, {
      eventType: event.eventType,
      maxDurationSeconds: options.maxDurationSeconds,
    })

    if (!type) {
      skipped += 1
      // Track unknown event types for user feedback
      if (typeof event.eventType === 'string' && event.eventType.trim()) {
        const normalizedType = event.eventType.trim()
        if (!unknownTypes.includes(normalizedType)) {
          unknownTypes.push(normalizedType)
        }
      }
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

    const validation = validateSegment(segment, options.maxDurationSeconds)
    if (!validation.valid) {
      skipped += 1
      continue
    }

    segments.push(segment)
  }

  return {
    segments: segments.sort(sortSegmentsByStart),
    skipped,
    unknownTypes,
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
  const sorted = [...segments].sort(sortSegmentsByStart)
  const events: Array<IntroSkipperExportEvent> = []
  const excludedTypes: Array<MediaSegmentType> = []
  let excludedCount = 0

  for (const segment of sorted) {
    const eventType = toExportEventTypeForSegment(segment.Type)
    if (!eventType) {
      excludedCount += 1
      if (segment.Type && !excludedTypes.includes(segment.Type)) {
        excludedTypes.push(segment.Type)
      }
      continue
    }

    const startSeconds =
      typeof segment.StartTicks === 'number' ? segment.StartTicks : 0
    const endSeconds =
      typeof segment.EndTicks === 'number' ? segment.EndTicks : 0

    const startTimeMs = secondsToMs(startSeconds)

    if (eventType === 'Outro') {
      events.push({
        startTimeMs,
        eventType,
      })
      continue
    }

    const endTimeMs = secondsToMs(endSeconds)
    events.push({
      startTimeMs,
      endTimeMs,
      eventType,
    })
  }

  return {
    payload: events,
    excludedTypes,
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
