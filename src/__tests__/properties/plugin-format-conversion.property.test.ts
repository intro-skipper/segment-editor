/**
 * Feature: Plugin Format Conversion
 * For any valid EDL data, converting to MediaSegment format SHALL produce valid
 * segments with correct timing. For any valid chapter markers, converting to
 * segments SHALL produce valid segments with correct boundaries.
 */

import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import type { EdlEntry } from '@/services/plugins/edl'
import type { ChapterMarker } from '@/services/plugins/chapter'
import {
  EdlAction,
  edlEntryToSegment,
  edlToSegments,
  segmentToEdlEntry,
} from '@/services/plugins/edl'
import {
  chapterToSegment,
  chaptersToSegments,
  getSegmentTypeFromChapterName,
  segmentToChapter,
} from '@/services/plugins/chapter'
import { MediaSegmentType } from '@/types/jellyfin'

// Arbitrary generators for EDL entries
const edlActionArb = fc.constantFrom(
  EdlAction.Cut,
  EdlAction.Mute,
  EdlAction.Scene,
  EdlAction.Commercial,
)

const validEdlEntryArb = fc
  .tuple(
    fc.double({ min: 0, max: 86400, noNaN: true, noDefaultInfinity: true }),
    fc.double({ min: 0.001, max: 3600, noNaN: true, noDefaultInfinity: true }),
    edlActionArb,
  )
  .map(([start, duration, action]) => ({
    start,
    end: start + duration,
    action,
  }))

// Arbitrary generators for chapter markers
const chapterNameArb = fc.constantFrom(
  'Intro',
  'Opening',
  'Outro',
  'Credits',
  'Preview',
  'Recap',
  'Commercial',
  'Chapter 1',
  'Scene Break',
)

const validChapterArb = fc
  .tuple(
    chapterNameArb,
    fc.double({ min: 0, max: 86400, noNaN: true, noDefaultInfinity: true }),
    fc.double({ min: 0.001, max: 3600, noNaN: true, noDefaultInfinity: true }),
  )
  .map(([name, start, duration]) => ({
    name,
    startPositionSeconds: start,
    endPositionSeconds: start + duration,
  }))

// Arbitrary for item IDs
const itemIdArb = fc.uuid()

describe('Plugin Format Conversion', () => {
  describe('EDL Format Conversion', () => {
    /**
     * Property: EDL to segment conversion produces valid segments
     * For any valid EDL entry, converting to MediaSegment SHALL produce
     * a segment with correct timing (start < end) and valid type.
     */
    it('converts EDL entries to valid segments with correct timing', () => {
      fc.assert(
        fc.property(validEdlEntryArb, itemIdArb, (entry, itemId) => {
          const segment = edlEntryToSegment(entry, itemId)

          // Segment should have valid structure
          expect(segment.Id).toBeDefined()
          expect(segment.ItemId).toBe(itemId)
          expect(segment.Type).toBeDefined()
          expect(segment.StartTicks).toBeDefined()
          expect(segment.EndTicks).toBeDefined()

          // Start should be less than end
          expect(segment.StartTicks!).toBeLessThan(segment.EndTicks!)

          // Ticks should be non-negative
          expect(segment.StartTicks!).toBeGreaterThanOrEqual(0)
          expect(segment.EndTicks!).toBeGreaterThan(0)

          return true
        }),
        { numRuns: 100 },
      )
    })

    /**
     * Property: EDL round-trip preserves timing
     * For any valid EDL entry, converting to segment and back SHALL
     * preserve the timing values within acceptable precision.
     */
    it('round-trips EDL entries through segments', () => {
      fc.assert(
        fc.property(validEdlEntryArb, itemIdArb, (entry, itemId) => {
          const segment = edlEntryToSegment(entry, itemId)
          const backToEdl = segmentToEdlEntry(segment)

          // Timing should be preserved within 0.001 seconds (1ms)
          expect(Math.abs(backToEdl.start - entry.start)).toBeLessThan(0.001)
          expect(Math.abs(backToEdl.end - entry.end)).toBeLessThan(0.001)

          return true
        }),
        { numRuns: 100 },
      )
    })

    /**
     * Property: Batch EDL conversion maintains count
     * For any array of EDL entries, converting to segments SHALL
     * produce the same number of segments.
     */
    it('batch converts EDL entries maintaining count', () => {
      fc.assert(
        fc.property(
          fc.array(validEdlEntryArb, { minLength: 0, maxLength: 20 }),
          itemIdArb,
          (entries, itemId) => {
            const segments = edlToSegments(entries, itemId)
            expect(segments.length).toBe(entries.length)

            // All segments should have the same itemId
            segments.forEach((segment) => {
              expect(segment.ItemId).toBe(itemId)
            })

            return true
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('Chapter Format Conversion', () => {
    /**
     * Property: Chapter to segment conversion produces valid segments
     * For any valid chapter marker, converting to MediaSegment SHALL
     * produce a segment with correct boundaries (start < end).
     */
    it('converts chapter markers to valid segments with correct boundaries', () => {
      fc.assert(
        fc.property(validChapterArb, itemIdArb, (chapter, itemId) => {
          const segment = chapterToSegment(chapter, itemId)

          // Segment should have valid structure
          expect(segment.Id).toBeDefined()
          expect(segment.ItemId).toBe(itemId)
          expect(segment.Type).toBeDefined()
          expect(segment.StartTicks).toBeDefined()
          expect(segment.EndTicks).toBeDefined()

          // Start should be less than end
          expect(segment.StartTicks!).toBeLessThan(segment.EndTicks!)

          // Ticks should be non-negative
          expect(segment.StartTicks!).toBeGreaterThanOrEqual(0)
          expect(segment.EndTicks!).toBeGreaterThan(0)

          return true
        }),
        { numRuns: 100 },
      )
    })

    /**
     * Property: Chapter round-trip preserves timing
     * For any valid chapter marker, converting to segment and back SHALL
     * preserve the timing values within acceptable precision.
     */
    it('round-trips chapter markers through segments', () => {
      fc.assert(
        fc.property(validChapterArb, itemIdArb, (chapter, itemId) => {
          const segment = chapterToSegment(chapter, itemId)
          const backToChapter = segmentToChapter(segment)

          // Timing should be preserved within 0.001 seconds (1ms)
          expect(
            Math.abs(
              backToChapter.startPositionSeconds - chapter.startPositionSeconds,
            ),
          ).toBeLessThan(0.001)
          expect(
            Math.abs(
              backToChapter.endPositionSeconds! - chapter.endPositionSeconds,
            ),
          ).toBeLessThan(0.001)

          return true
        }),
        { numRuns: 100 },
      )
    })

    /**
     * Property: Chapter name determines segment type
     * For any known chapter name, the segment type SHALL be correctly
     * determined based on the name.
     */
    it('determines segment type from chapter name', () => {
      // Test known mappings
      expect(getSegmentTypeFromChapterName('intro')).toBe(
        MediaSegmentType.Intro,
      )
      expect(getSegmentTypeFromChapterName('Opening')).toBe(
        MediaSegmentType.Intro,
      )
      expect(getSegmentTypeFromChapterName('outro')).toBe(
        MediaSegmentType.Outro,
      )
      expect(getSegmentTypeFromChapterName('Credits')).toBe(
        MediaSegmentType.Outro,
      )
      expect(getSegmentTypeFromChapterName('preview')).toBe(
        MediaSegmentType.Preview,
      )
      expect(getSegmentTypeFromChapterName('recap')).toBe(
        MediaSegmentType.Recap,
      )
      expect(getSegmentTypeFromChapterName('commercial')).toBe(
        MediaSegmentType.Commercial,
      )

      // Unknown names should default to Intro
      expect(getSegmentTypeFromChapterName('Random Chapter')).toBe(
        MediaSegmentType.Intro,
      )
    })

    /**
     * Property: Batch chapter conversion maintains count
     * For any array of chapter markers, converting to segments SHALL
     * produce the same number of segments.
     */
    it('batch converts chapter markers maintaining count', () => {
      fc.assert(
        fc.property(
          fc.array(validChapterArb, { minLength: 0, maxLength: 20 }),
          itemIdArb,
          (chapters, itemId) => {
            const segments = chaptersToSegments(chapters, itemId)
            expect(segments.length).toBe(chapters.length)

            // All segments should have the same itemId
            segments.forEach((segment) => {
              expect(segment.ItemId).toBe(itemId)
            })

            return true
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('Cross-Format Consistency', () => {
    /**
     * Property: Both formats produce valid MediaSegments
     * For any valid input (EDL or chapter), the resulting segment SHALL
     * have all required fields and valid timing.
     */
    it('both formats produce segments with required fields', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            validEdlEntryArb.map((e) => ({ type: 'edl' as const, data: e })),
            validChapterArb.map((c) => ({ type: 'chapter' as const, data: c })),
          ),
          itemIdArb,
          (input, itemId) => {
            const segment =
              input.type === 'edl'
                ? edlEntryToSegment(input.data as EdlEntry, itemId)
                : chapterToSegment(input.data as ChapterMarker, itemId)

            // All segments must have these fields
            expect(segment.Id).toBeTruthy()
            expect(segment.ItemId).toBe(itemId)
            expect(segment.Type).toBeDefined()
            expect(typeof segment.StartTicks).toBe('number')
            expect(typeof segment.EndTicks).toBe('number')
            expect(segment.StartTicks!).toBeLessThan(segment.EndTicks!)

            return true
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
