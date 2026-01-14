/**
 * Feature: codebase-audit-refactor, Property: Zod Schema Validation Round-Trip
 * For any valid MediaSegmentDto object, parsing with the Zod schema SHALL succeed
 * and produce an equivalent object. For any object missing required fields or with
 * invalid types, parsing SHALL fail with a descriptive error.
 */

import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { MediaSegmentSchema, TimeInputSchema } from '@/lib/schemas'

/** Valid segment types matching the schema */
const VALID_SEGMENT_TYPES = [
  'Intro',
  'Outro',
  'Preview',
  'Recap',
  'Commercial',
  'Unknown',
] as const

const segmentTypeArb = fc.constantFrom(...VALID_SEGMENT_TYPES)
const uuidArb = fc.uuid()
const ticksArb = fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER })

const validSegmentArb = fc.record({
  Id: fc.option(uuidArb, { nil: undefined }),
  ItemId: fc.option(uuidArb, { nil: undefined }),
  Type: segmentTypeArb,
  StartTicks: ticksArb,
  EndTicks: ticksArb,
})

describe('Zod Schema Validation Round-Trip', () => {
  it('parses valid segments and produces equivalent objects', () => {
    fc.assert(
      fc.property(validSegmentArb, (segment) => {
        const result = MediaSegmentSchema.safeParse(segment)
        if (!result.success) return false

        const parsed = result.data
        return (
          parsed.Type === segment.Type &&
          parsed.StartTicks === segment.StartTicks &&
          parsed.EndTicks === segment.EndTicks &&
          parsed.Id === segment.Id &&
          parsed.ItemId === segment.ItemId
        )
      }),
      { numRuns: 100 },
    )
  })

  it('parsing is idempotent - parsing twice produces same result', () => {
    fc.assert(
      fc.property(validSegmentArb, (segment) => {
        const firstParse = MediaSegmentSchema.safeParse(segment)
        if (!firstParse.success) return false

        const secondParse = MediaSegmentSchema.safeParse(firstParse.data)
        if (!secondParse.success) return false

        return (
          firstParse.data.Type === secondParse.data.Type &&
          firstParse.data.StartTicks === secondParse.data.StartTicks &&
          firstParse.data.EndTicks === secondParse.data.EndTicks &&
          firstParse.data.Id === secondParse.data.Id &&
          firstParse.data.ItemId === secondParse.data.ItemId
        )
      }),
      { numRuns: 100 },
    )
  })

  it('rejects invalid segment types', () => {
    const invalidTypes = ['intro', 'INTRO', 'invalid', '', 'Other', 123, null]

    fc.assert(
      fc.property(
        fc.constantFrom(...invalidTypes),
        ticksArb,
        ticksArb,
        (invalidType, start, end) => {
          const result = MediaSegmentSchema.safeParse({
            Type: invalidType,
            StartTicks: start,
            EndTicks: end,
          })
          return result.success === false
        },
      ),
      { numRuns: 100 },
    )
  })

  it('rejects negative tick values', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: -1 }),
        ticksArb,
        segmentTypeArb,
        (negativeTicks, positiveTicks, type) => {
          const result1 = MediaSegmentSchema.safeParse({
            Type: type,
            StartTicks: negativeTicks,
            EndTicks: positiveTicks,
          })
          const result2 = MediaSegmentSchema.safeParse({
            Type: type,
            StartTicks: positiveTicks,
            EndTicks: negativeTicks,
          })
          return result1.success === false && result2.success === false
        },
      ),
      { numRuns: 100 },
    )
  })

  it('rejects objects missing required fields', () => {
    fc.assert(
      fc.property(uuidArb, ticksArb, segmentTypeArb, (id, ticks, type) => {
        const result1 = MediaSegmentSchema.safeParse({
          Id: id,
          StartTicks: ticks,
          EndTicks: ticks,
        })
        const result2 = MediaSegmentSchema.safeParse({
          Id: id,
          Type: type,
          EndTicks: ticks,
        })
        const result3 = MediaSegmentSchema.safeParse({
          Id: id,
          Type: type,
          StartTicks: ticks,
        })

        return !result1.success && !result2.success && !result3.success
      }),
      { numRuns: 100 },
    )
  })

  it('rejects invalid UUID format for Id field', () => {
    const invalidUuids = [
      'not-a-uuid',
      '12345',
      'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      '123e4567-e89b-12d3-a456',
      '',
    ]

    fc.assert(
      fc.property(
        fc.constantFrom(...invalidUuids),
        ticksArb,
        ticksArb,
        segmentTypeArb,
        (invalidId, start, end, type) => {
          const result = MediaSegmentSchema.safeParse({
            Id: invalidId,
            Type: type,
            StartTicks: start,
            EndTicks: end,
          })
          return result.success === false
        },
      ),
      { numRuns: 100 },
    )
  })

  it('rejects non-numeric tick values', () => {
    const nonNumericValues = ['100', '0', null, undefined, {}, [], true]

    fc.assert(
      fc.property(
        fc.constantFrom(...nonNumericValues),
        segmentTypeArb,
        (nonNumeric, type) => {
          const result1 = MediaSegmentSchema.safeParse({
            Type: type,
            StartTicks: nonNumeric,
            EndTicks: 1000,
          })
          const result2 = MediaSegmentSchema.safeParse({
            Type: type,
            StartTicks: 0,
            EndTicks: nonNumeric,
          })
          return result1.success === false && result2.success === false
        },
      ),
      { numRuns: 100 },
    )
  })

  it('MediaSegmentSchema.parse throws on invalid input', () => {
    const invalidSegments = [
      null,
      undefined,
      {},
      { Type: 'Invalid' },
      { StartTicks: -1, EndTicks: 100, Type: 'Intro' },
    ]
    for (const invalid of invalidSegments) {
      expect(() => MediaSegmentSchema.parse(invalid)).toThrow()
    }
  })
})

describe('TimeInput Schema Validation', () => {
  it('parses valid numeric time inputs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }).map((n) => n + Math.random()),
        (time) => {
          const result = TimeInputSchema.safeParse(time)
          return result.success === true && result.data === time
        },
      ),
      { numRuns: 100 },
    )
  })

  it('parses valid time string formats', () => {
    const validTimeStrings = [
      '0',
      '123',
      '1:30',
      '01:30:00',
      '90.5',
      '1:30.5',
      '12:34:56.789',
      '0:00',
      '99:99:99',
    ]

    fc.assert(
      fc.property(fc.constantFrom(...validTimeStrings), (timeStr) => {
        const result = TimeInputSchema.safeParse(timeStr)
        return result.success === true && result.data === timeStr
      }),
      { numRuns: 100 },
    )
  })

  it('rejects negative numeric time inputs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: -1 }).map((n) => n + Math.random()),
        (time) => {
          const result = TimeInputSchema.safeParse(time)
          return result.success === false
        },
      ),
      { numRuns: 100 },
    )
  })

  it('rejects invalid time string formats', () => {
    const invalidTimeStrings = [
      'abc',
      '1:30am',
      '12:34:56pm',
      '-1:30',
      '1h30m',
      'noon',
      '',
      ' ',
      '1 30',
    ]

    fc.assert(
      fc.property(fc.constantFrom(...invalidTimeStrings), (timeStr) => {
        const result = TimeInputSchema.safeParse(timeStr)
        return result.success === false
      }),
      { numRuns: 100 },
    )
  })

  it('rejects non-string, non-number types', () => {
    const invalidTypes = [null, undefined, {}, [], true, false]

    fc.assert(
      fc.property(fc.constantFrom(...invalidTypes), (invalid) => {
        const result = TimeInputSchema.safeParse(invalid)
        return result.success === false
      }),
      { numRuns: 100 },
    )
  })

  it('TimeInputSchema.parse throws on invalid input', () => {
    const invalidInputs = [null, undefined, 'abc', -1, '1:30am']
    for (const invalid of invalidInputs) {
      expect(() => TimeInputSchema.parse(invalid)).toThrow()
    }
  })
})
