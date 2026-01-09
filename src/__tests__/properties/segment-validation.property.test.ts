/**
 * Feature: codebase-audit-refactor, Property: Segment Timestamp Validation
 * For any segment where StartTicks >= EndTicks, the validateSegment function
 * SHALL return { valid: false } with an appropriate error message.
 * For any segment where StartTicks < EndTicks and both are non-negative,
 * validation SHALL return { valid: true }.
 */

import { describe, it } from 'vitest'
import * as fc from 'fast-check'
import type { MediaSegmentDto, MediaSegmentType } from '@/types/jellyfin'
import { validateSegment } from '@/lib/segment-utils'

/** Valid segment types for testing */
const SEGMENT_TYPES: Array<MediaSegmentType> = [
  'Unknown',
  'Commercial',
  'Preview',
  'Recap',
  'Outro',
  'Intro',
]

// Arbitrary for segment types
const segmentTypeArb = fc.constantFrom(...SEGMENT_TYPES)

describe('Segment Timestamp Validation', () => {
  /**
   * Property: Valid segments (StartTicks < EndTicks, both non-negative) pass validation
   * For any segment where StartTicks < EndTicks and both are non-negative,
   * validateSegment SHALL return { valid: true }.
   */
  it('returns valid=true when StartTicks < EndTicks and both non-negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        segmentTypeArb,
        (start, gap, type) => {
          const segment: MediaSegmentDto = {
            Id: 'test-id',
            ItemId: 'test-item',
            Type: type,
            StartTicks: start,
            EndTicks: start + gap, // Ensures EndTicks > StartTicks
          }

          const result = validateSegment(segment)
          return result.valid === true && result.error === undefined
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Invalid segments (StartTicks > EndTicks) fail validation
   * For any segment where StartTicks > EndTicks, validateSegment SHALL
   * return { valid: false } with error message about start/end relationship.
   */
  it('returns valid=false when StartTicks > EndTicks', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        segmentTypeArb,
        (end, gap, type) => {
          const segment: MediaSegmentDto = {
            Id: 'test-id',
            ItemId: 'test-item',
            Type: type,
            StartTicks: end + gap, // Ensures StartTicks > EndTicks
            EndTicks: end,
          }

          const result = validateSegment(segment)
          return (
            result.valid === false &&
            result.error === 'Start time must be less than end time'
          )
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Invalid segments (StartTicks === EndTicks) fail validation
   * For any segment where StartTicks === EndTicks, validateSegment SHALL
   * return { valid: false } with error message about start/end relationship.
   */
  it('returns valid=false when StartTicks === EndTicks', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        segmentTypeArb,
        (time, type) => {
          const segment: MediaSegmentDto = {
            Id: 'test-id',
            ItemId: 'test-item',
            Type: type,
            StartTicks: time,
            EndTicks: time, // Same as StartTicks
          }

          const result = validateSegment(segment)
          return (
            result.valid === false &&
            result.error === 'Start time must be less than end time'
          )
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Negative StartTicks fails validation
   * For any segment with negative StartTicks, validateSegment SHALL
   * return { valid: false } with appropriate error message.
   */
  it('returns valid=false when StartTicks is negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: -1 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        segmentTypeArb,
        (start, end, type) => {
          const segment: MediaSegmentDto = {
            Id: 'test-id',
            ItemId: 'test-item',
            Type: type,
            StartTicks: start,
            EndTicks: end,
          }

          const result = validateSegment(segment)
          return (
            result.valid === false &&
            result.error === 'Start time cannot be negative'
          )
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Negative EndTicks fails validation
   * For any segment with negative EndTicks (and non-negative StartTicks),
   * validateSegment SHALL return { valid: false } with appropriate error message.
   */
  it('returns valid=false when EndTicks is negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: -1_000_000, max: -1 }),
        segmentTypeArb,
        (start, end, type) => {
          const segment: MediaSegmentDto = {
            Id: 'test-id',
            ItemId: 'test-item',
            Type: type,
            StartTicks: start,
            EndTicks: end,
          }

          const result = validateSegment(segment)
          return (
            result.valid === false &&
            result.error === 'End time cannot be negative'
          )
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Null segment fails validation
   * For null or undefined segment, validateSegment SHALL return { valid: false }.
   */
  it('returns valid=false for null or undefined segment', () => {
    const nullResult = validateSegment(null)
    const undefinedResult = validateSegment(undefined)

    fc.assert(
      fc.property(fc.constant(null), () => {
        return (
          nullResult.valid === false &&
          nullResult.error === 'Segment is required' &&
          undefinedResult.valid === false &&
          undefinedResult.error === 'Segment is required'
        )
      }),
      { numRuns: 1 },
    )
  })

  /**
   * Property: Validation is consistent across all segment types
   * For any segment type, the validation logic SHALL behave consistently
   * based only on StartTicks and EndTicks values.
   */
  it('validates consistently across all segment types', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 1001, max: 2000 }),
        (start, end) => {
          // Test all segment types with the same start/end values
          const results = SEGMENT_TYPES.map((type) => {
            const segment: MediaSegmentDto = {
              Id: 'test-id',
              ItemId: 'test-item',
              Type: type,
              StartTicks: start,
              EndTicks: end,
            }
            return validateSegment(segment)
          })

          // All results should be valid since start < end
          return results.every((r) => r.valid === true)
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Minimal valid gap is accepted
   * For any segment with StartTicks just 1 less than EndTicks,
   * validateSegment SHALL return { valid: true }.
   */
  it('accepts minimal valid gap (EndTicks = StartTicks + 1)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        segmentTypeArb,
        (start, type) => {
          const segment: MediaSegmentDto = {
            Id: 'test-id',
            ItemId: 'test-item',
            Type: type,
            StartTicks: start,
            EndTicks: start + 1, // Minimal valid gap
          }

          const result = validateSegment(segment)
          return result.valid === true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Zero values are valid when properly ordered
   * For segment with StartTicks=0 and EndTicks>0, validation SHALL pass.
   */
  it('accepts zero StartTicks with positive EndTicks', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        segmentTypeArb,
        (end, type) => {
          const segment: MediaSegmentDto = {
            Id: 'test-id',
            ItemId: 'test-item',
            Type: type,
            StartTicks: 0,
            EndTicks: end,
          }

          const result = validateSegment(segment)
          return result.valid === true
        },
      ),
      { numRuns: 100 },
    )
  })
})
