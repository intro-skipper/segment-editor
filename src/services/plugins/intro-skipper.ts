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
import { generateUUID, sortSegmentsByStart, validateSegment } from '@/lib/segment-utils'

type IntroSkipperEventType =
  | 'SKIP_INTRO'
  | 'SKIP_RECAP'
  | 'END_CREDITS'

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

interface IntroSkipperExportInterval {
  startTimeMs: number
  endTimeMs?: number
}

interface IntroSkipperExportEvent {
  startTimeMs: number
  endTimeMs?: number
  eventType: IntroSkipperEventType
  intervals: Array<IntroSkipperExportInterval>
}

interface IntroSkipperExportPayload {
  events: Array<IntroSkipperExportEvent>
}

const EVENT_TYPE_TO_SEGMENT_TYPE: Record<IntroSkipperEventType, MediaSegmentType> = {
  SKIP_INTRO: 'Intro',
  SKIP_RECAP: 'Recap',
  END_CREDITS: 'Outro',
}

const SEGMENT_TYPE_TO_EVENT_TYPE: Partial<Record<MediaSegmentType, IntroSkipperEventType>> = {
  Intro: 'SKIP_INTRO',
  Recap: 'SKIP_RECAP',
  Outro: 'END_CREDITS',
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
  const interval0 = event.intervals?.[0]

  const startMsRaw = event.startTimeMs ?? interval0?.startTimeMs
  if (!isNumber(startMsRaw)) return null

  const endMsRaw = event.endTimeMs ?? interval0?.endTimeMs

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

  return (
    EVENT_TYPE_TO_SEGMENT_TYPE[normalized as IntroSkipperEventType] ?? null
  )
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
  error?: string
} {
  if (!text.trim()) return { segments: [], skipped: 0, error: 'Clipboard is empty' }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { segments: [], skipped: 0, error: 'Clipboard is not valid JSON' }
  }

  const payload: IntroSkipperPayload =
    isRecord(parsed) && 'events' in parsed
      ? (parsed as IntroSkipperPayload)
      : isRecord(parsed)
        ? (parsed as IntroSkipperPayload)
        : {}

  const events = Array.isArray(payload.events) ? payload.events : null
  if (!events) {
    return {
      segments: [],
      skipped: 0,
      error: 'JSON does not contain an events array',
    }
  }

  const segments: Array<MediaSegmentDto> = []
  let skipped = 0

  for (const event of events) {
    const type = getEventSegmentType(event.eventType)
    const timing = getEventTimingMs(event, {
      eventType: event.eventType,
      maxDurationSeconds: options.maxDurationSeconds,
    })

    if (!type || !timing) {
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
    error: segments.length === 0 ? 'No importable events found' : undefined,
  }
}

const toEventTypeForSegment = (
  type: MediaSegmentType | null | undefined,
): IntroSkipperEventType | null => {
  if (!type) return null
  return SEGMENT_TYPE_TO_EVENT_TYPE[type] ?? null
}

/**
 * Converts current UI segments into an Intro Skipper JSON payload.
 *
 * - Only exports: Intro, Recap, Outro
 * - Ignores: Preview, Commercial, Unknown
 * - END_CREDITS omits endTimeMs (it is assumed to run to the end)
 */
export function segmentsToIntroSkipperPayload(
  segments: Array<MediaSegmentDto>,
): IntroSkipperExportPayload {
  const sorted = [...segments].sort(sortSegmentsByStart)
  const events: Array<IntroSkipperExportEvent> = []

  for (const segment of sorted) {
    const eventType = toEventTypeForSegment(segment.Type)
    if (!eventType) continue

    const startSeconds = typeof segment.StartTicks === 'number' ? segment.StartTicks : 0
    const endSeconds = typeof segment.EndTicks === 'number' ? segment.EndTicks : 0

    const startTimeMs = secondsToMs(startSeconds)

    if (eventType === 'END_CREDITS') {
      events.push({
        startTimeMs,
        eventType,
        intervals: [{ startTimeMs }],
      })
      continue
    }

    const endTimeMs = secondsToMs(endSeconds)
    events.push({
      startTimeMs,
      endTimeMs,
      eventType,
      intervals: [{ startTimeMs, endTimeMs }],
    })
  }

  return { events }
}

/**
 * Creates clipboard-ready JSON text for Intro Skipper.
 * Uses tab indentation to match typical clipboard snippets.
 */
export function segmentsToIntroSkipperClipboardText(
  segments: Array<MediaSegmentDto>,
): string {
  const payload = segmentsToIntroSkipperPayload(segments)
  return JSON.stringify(payload, null, '\t')
}
