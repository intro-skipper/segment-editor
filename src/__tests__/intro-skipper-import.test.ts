import { describe, expect, it } from 'vitest'

import {
  introSkipperClipboardTextToSegments,
  segmentsToIntroSkipperPayload,
  segmentsToIntroSkipperClipboardText,
} from '@/services/plugins/intro-skipper'
import type { MediaSegmentDto } from '@/types/jellyfin'

describe('Intro Skipper clipboard import', () => {
  it('converts events JSON into segments', () => {
    const text = JSON.stringify({
      events: [
        {
          startTimeMs: 3673000,
          eventType: 'END_CREDITS',
          intervals: [{ startTimeMs: 3673000 }],
        },
        {
          startTimeMs: 3673000,
          eventType: 'NEXT_UP',
          intervals: [{ startTimeMs: 3673000 }],
        },
        {
          startTimeMs: 7000,
          endTimeMs: 120000,
          eventType: 'SKIP_RECAP',
          intervals: [{ startTimeMs: 7000, endTimeMs: 120000 }],
        },
        {
          startTimeMs: 121000,
          endTimeMs: 174000,
          eventType: 'SKIP_INTRO',
          intervals: [{ startTimeMs: 121000, endTimeMs: 174000 }],
        },
      ],
    })

    const result = introSkipperClipboardTextToSegments(text, {
      itemId: 'item-1',
      maxDurationSeconds: 10_000,
    })

    expect(result.error).toBeUndefined()
    expect(result.segments).toHaveLength(3)
    expect(result.skipped).toBe(1)

    // Sorted by start time
    expect(result.segments[0]?.Type).toBe('Recap')
    expect(result.segments[0]?.StartTicks).toBeCloseTo(7, 5)
    expect(result.segments[0]?.EndTicks).toBeCloseTo(120, 5)

    expect(result.segments[1]?.Type).toBe('Intro')
    expect(result.segments[1]?.StartTicks).toBeCloseTo(121, 5)
    expect(result.segments[1]?.EndTicks).toBeCloseTo(174, 5)

    // END_CREDITS without endTimeMs runs until media end (maxDurationSeconds)
    expect(result.segments[2]?.Type).toBe('Outro')
    expect(result.segments[2]?.StartTicks).toBeCloseTo(3673, 5)
    expect(result.segments[2]?.EndTicks).toBeCloseTo(10_000, 5)
  })

  it('imports when JSON is a raw events array (no wrapper)', () => {
    const text = JSON.stringify([
      {
        startTimeMs: 7000,
        endTimeMs: 120000,
        eventType: 'SKIP_RECAP',
        intervals: [{ startTimeMs: 7000, endTimeMs: 120000 }],
      },
    ])

    const result = introSkipperClipboardTextToSegments(text, {
      itemId: 'item-1',
      maxDurationSeconds: 10_000,
    })

    expect(result.error).toBeUndefined()
    expect(result.segments).toHaveLength(1)
    expect(result.segments[0]?.Type).toBe('Recap')
  })

  it('imports when JSON is a single event object (no wrapper)', () => {
    const text = JSON.stringify({
      startTimeMs: 121000,
      endTimeMs: 174000,
      eventType: 'SKIP_INTRO',
      intervals: [{ startTimeMs: 121000, endTimeMs: 174000 }],
    })

    const result = introSkipperClipboardTextToSegments(text, {
      itemId: 'item-1',
      maxDurationSeconds: 10_000,
    })

    expect(result.error).toBeUndefined()
    expect(result.segments).toHaveLength(1)
    expect(result.segments[0]?.Type).toBe('Intro')
  })

  it('imports seconds-based markers object (intro/credits/preview)', () => {
    const text = JSON.stringify({
      credits: {
        end: 1422,
        start: 1331,
        type: 'credits',
      },
      intro: {
        end: 483,
        start: 392,
        type: 'intro',
      },
      preview: {
        end: 1437,
        start: 1422,
        type: 'preview',
      },
    })

    const result = introSkipperClipboardTextToSegments(text, {
      itemId: 'item-1',
      maxDurationSeconds: 10_000,
    })

    expect(result.error).toBeUndefined()
    expect(result.segments).toHaveLength(3)

    // Sorted by start time
    expect(result.segments[0]?.Type).toBe('Intro')
    expect(result.segments[0]?.StartTicks).toBeCloseTo(392, 5)
    expect(result.segments[0]?.EndTicks).toBeCloseTo(483, 5)

    expect(result.segments[1]?.Type).toBe('Outro')
    expect(result.segments[1]?.StartTicks).toBeCloseTo(1331, 5)
    expect(result.segments[1]?.EndTicks).toBeCloseTo(1422, 5)

    expect(result.segments[2]?.Type).toBe('Preview')
    expect(result.segments[2]?.StartTicks).toBeCloseTo(1422, 5)
    expect(result.segments[2]?.EndTicks).toBeCloseTo(1437, 5)
  })

  it('exports segments back into Intro Skipper JSON structure', () => {
    const segments = [
      {
        Id: 'a',
        ItemId: 'item-1',
        Type: 'Recap' as const,
        StartTicks: 7,
        EndTicks: 120,
      },
      {
        Id: 'b',
        ItemId: 'item-1',
        Type: 'Intro' as const,
        StartTicks: 121,
        EndTicks: 174,
      },
      {
        Id: 'c',
        ItemId: 'item-1',
        Type: 'Outro' as const,
        StartTicks: 3673,
        EndTicks: 10_000,
      },
      // Should be ignored
      {
        Id: 'd',
        ItemId: 'item-1',
        Type: 'Preview' as const,
        StartTicks: 1,
        EndTicks: 2,
      },
    ] satisfies Array<MediaSegmentDto>

    const payload = segmentsToIntroSkipperPayload(segments)
    expect(payload).toHaveLength(3)

    expect(payload[0]).toMatchObject({
      eventType: 'Recap',
      startTimeMs: 7000,
      endTimeMs: 120000,
    })

    expect(payload[1]).toMatchObject({
      eventType: 'Intro',
      startTimeMs: 121000,
      endTimeMs: 174000,
    })

    // Outro omits endTimeMs (assumed to run until end)
    expect(payload[2]).toMatchObject({
      eventType: 'Outro',
      startTimeMs: 3673000,
    })
    expect('endTimeMs' in payload[2]!).toBe(false)

    // Clipboard text should be parseable JSON
    const text = segmentsToIntroSkipperClipboardText(segments)
    const reparsed = JSON.parse(text) as Array<unknown>
    expect(Array.isArray(reparsed)).toBe(true)
  })
})
