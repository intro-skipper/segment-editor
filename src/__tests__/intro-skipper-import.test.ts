import { describe, expect, it } from 'vitest'

import type { Segment } from '@/types/segment'
import {
  introSkipperClipboardTextToSegments,
  segmentsToIntroSkipperClipboardText,
  segmentsToIntroSkipperPayload,
} from '@/services/plugins/intro-skipper'

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
    expect(result.segments[0]?.type).toBe('Recap')
    expect(result.segments[0]?.startSeconds).toBeCloseTo(7, 5)
    expect(result.segments[0]?.endSeconds).toBeCloseTo(120, 5)

    expect(result.segments[1]?.type).toBe('Intro')
    expect(result.segments[1]?.startSeconds).toBeCloseTo(121, 5)
    expect(result.segments[1]?.endSeconds).toBeCloseTo(174, 5)

    // END_CREDITS without endTimeMs runs until media end (maxDurationSeconds)
    expect(result.segments[2]?.type).toBe('Outro')
    expect(result.segments[2]?.startSeconds).toBeCloseTo(3673, 5)
    expect(result.segments[2]?.endSeconds).toBeCloseTo(10_000, 5)
  })

  it('skips events that end past the media or before they start', () => {
    const text = JSON.stringify({
      events: [
        { startTimeMs: 7000, endTimeMs: 12000, eventType: 'SKIP_RECAP' },
        { startTimeMs: 9000, endTimeMs: 11000_000, eventType: 'SKIP_INTRO' },
        { startTimeMs: 50000, endTimeMs: 40000, eventType: 'SKIP_INTRO' },
      ],
    })

    const result = introSkipperClipboardTextToSegments(text, {
      itemId: 'item-1',
      maxDurationSeconds: 10_000,
    })

    expect(result.segments.map((s) => s.type)).toEqual(['Recap'])
    expect(result.skipped).toBe(2)
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
    expect(result.segments[0]?.type).toBe('Recap')
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
    expect(result.segments[0]?.type).toBe('Intro')
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
    expect(result.segments[0]?.type).toBe('Intro')
    expect(result.segments[0]?.startSeconds).toBeCloseTo(392, 5)
    expect(result.segments[0]?.endSeconds).toBeCloseTo(483, 5)

    expect(result.segments[1]?.type).toBe('Outro')
    expect(result.segments[1]?.startSeconds).toBeCloseTo(1331, 5)
    expect(result.segments[1]?.endSeconds).toBeCloseTo(1422, 5)

    expect(result.segments[2]?.type).toBe('Preview')
    expect(result.segments[2]?.startSeconds).toBeCloseTo(1422, 5)
    expect(result.segments[2]?.endSeconds).toBeCloseTo(1437, 5)
  })

  it('imports when events array is deeply nested', () => {
    const text = JSON.stringify({
      transitionTimecodes: {
        result: {
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
        },
      },
    })

    const result = introSkipperClipboardTextToSegments(text, {
      itemId: 'item-1',
      maxDurationSeconds: 10_000,
    })

    expect(result.error).toBeUndefined()
    expect(result.segments).toHaveLength(3)
    expect(result.skipped).toBe(1)

    expect(result.segments[0]?.type).toBe('Recap')
    expect(result.segments[1]?.type).toBe('Intro')
    expect(result.segments[2]?.type).toBe('Outro')
  })

  it('exports segments back into Intro Skipper JSON structure', () => {
    const segments = [
      {
        id: 'a',
        itemId: 'item-1',
        type: 'Recap' as const,
        startSeconds: 7,
        endSeconds: 120,
      },
      {
        id: 'b',
        itemId: 'item-1',
        type: 'Intro' as const,
        startSeconds: 121,
        endSeconds: 174,
      },
      {
        id: 'c',
        itemId: 'item-1',
        type: 'Outro' as const,
        startSeconds: 3673,
        endSeconds: 10_000,
      },
      // Should be ignored
      {
        id: 'd',
        itemId: 'item-1',
        type: 'Preview' as const,
        startSeconds: 1,
        endSeconds: 2,
      },
    ] satisfies Array<Segment>

    const result = segmentsToIntroSkipperPayload(segments)
    expect(result.payload).toHaveLength(3)
    expect(result.excludedCount).toBe(1)
    expect(result.excludedTypes).toContain('Preview')

    expect(result.payload[0]).toMatchObject({
      eventType: 'Recap',
      startTimeMs: 7000,
      endTimeMs: 120000,
    })

    expect(result.payload[1]).toMatchObject({
      eventType: 'Intro',
      startTimeMs: 121000,
      endTimeMs: 174000,
    })

    // Outro omits endTimeMs (assumed to run until end)
    expect(result.payload[2]).toMatchObject({
      eventType: 'Outro',
      startTimeMs: 3673000,
    })
    const outro = result.payload[2]
    expect('endTimeMs' in outro).toBe(false)

    // Clipboard text should be parseable JSON
    const clipboardResult = segmentsToIntroSkipperClipboardText(segments)
    const reparsed = JSON.parse(clipboardResult.text)
    expect(Array.isArray(reparsed)).toBe(true)
    expect(clipboardResult.excludedCount).toBe(1)
  })

  it('tracks unknown event types during import', () => {
    const text = JSON.stringify({
      events: [
        {
          startTimeMs: 7000,
          endTimeMs: 120000,
          eventType: 'SKIP_INTRO',
        },
        {
          startTimeMs: 3673000,
          eventType: 'NEXT_UP',
        },
        {
          startTimeMs: 5000000,
          eventType: 'CUSTOM_EVENT',
        },
      ],
    })

    const result = introSkipperClipboardTextToSegments(text, {
      itemId: 'item-1',
      maxDurationSeconds: 10_000,
    })

    expect(result.segments).toHaveLength(1)
    expect(result.skipped).toBe(2)
    expect(result.unknownTypes).toContain('NEXT_UP')
    expect(result.unknownTypes).toContain('CUSTOM_EVENT')
    expect(result.unknownTypes).toHaveLength(2)
  })
})
