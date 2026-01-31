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
    expect(payload.events).toHaveLength(3)

    expect(payload.events[0]).toMatchObject({
      eventType: 'SKIP_RECAP',
      startTimeMs: 7000,
      endTimeMs: 120000,
      intervals: [{ startTimeMs: 7000, endTimeMs: 120000 }],
    })

    expect(payload.events[1]).toMatchObject({
      eventType: 'SKIP_INTRO',
      startTimeMs: 121000,
      endTimeMs: 174000,
      intervals: [{ startTimeMs: 121000, endTimeMs: 174000 }],
    })

    // END_CREDITS omits endTimeMs
    expect(payload.events[2]).toMatchObject({
      eventType: 'END_CREDITS',
      startTimeMs: 3673000,
      intervals: [{ startTimeMs: 3673000 }],
    })
    expect('endTimeMs' in payload.events[2]!).toBe(false)

    // Clipboard text should be parseable JSON
    const text = segmentsToIntroSkipperClipboardText(segments)
    const reparsed = JSON.parse(text) as { events: Array<unknown> }
    expect(Array.isArray(reparsed.events)).toBe(true)
  })
})
