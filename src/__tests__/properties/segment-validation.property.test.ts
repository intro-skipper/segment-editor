/**
 * Feature: codebase-audit-refactor, Property: Segment Timestamp Validation
 * For any segment where startSeconds >= endSeconds, the segment form validation
 * SHALL return { valid: false } with an appropriate error message.
 * For any segment where startSeconds < endSeconds and both are non-negative,
 * validation SHALL return { valid: true }.
 */

import { describe, it } from 'vitest'
import * as fc from 'fast-check'
import type { MediaSegmentType } from '@/types/jellyfin'
import type { Segment } from '@/types/segment'
import {
  getSegmentFormDefaults,
  validateSegmentFormValues,
} from '@/lib/forms/segment-form'

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

const validateSegmentValues = (segment: Segment, maxDuration?: number | null) =>
  validateSegmentFormValues(getSegmentFormDefaults(segment), maxDuration)

describe('Segment Timestamp Validation', () => {
  /**
   * Property: Valid segments (startSeconds < endSeconds, both non-negative) pass validation
   * For any segment where startSeconds < endSeconds and both are non-negative,
   * the segment schema SHALL return { valid: true }.
   */
  it('returns valid=true when startSeconds < endSeconds and both non-negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        segmentTypeArb,
        (start, gap, type) => {
          const segment: Segment = {
            id: 'test-id',
            itemId: 'test-item',
            type,
            startSeconds: start,
            endSeconds: start + gap, // Ensures endSeconds > startSeconds
          }

          const result = validateSegmentValues(segment)
          return result.valid === true && result.error === undefined
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Invalid segments (startSeconds > endSeconds) fail validation
   * For any segment where startSeconds > endSeconds, the segment schema SHALL
   * return { valid: false } with error message about start/end relationship.
   */
  it('returns valid=false when startSeconds > endSeconds', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        segmentTypeArb,
        (end, gap, type) => {
          const segment: Segment = {
            id: 'test-id',
            itemId: 'test-item',
            type,
            startSeconds: end + gap, // Ensures startSeconds > endSeconds
            endSeconds: end,
          }

          const result = validateSegmentValues(segment)
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
   * Property: Invalid segments (startSeconds === endSeconds) fail validation
   * For any segment where startSeconds === endSeconds, the segment schema SHALL
   * return { valid: false } with error message about start/end relationship.
   */
  it('returns valid=false when startSeconds === endSeconds', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        segmentTypeArb,
        (time, type) => {
          const segment: Segment = {
            id: 'test-id',
            itemId: 'test-item',
            type,
            startSeconds: time,
            endSeconds: time, // Same as startSeconds
          }

          const result = validateSegmentValues(segment)
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
   * Property: Negative startSeconds fails validation
   * For any segment with negative startSeconds, the segment schema SHALL
   * return { valid: false } with appropriate error message.
   */
  it('returns valid=false when startSeconds is negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: -1 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        segmentTypeArb,
        (start, end, type) => {
          const segment: Segment = {
            id: 'test-id',
            itemId: 'test-item',
            type,
            startSeconds: start,
            endSeconds: end,
          }

          const result = validateSegmentValues(segment)
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
   * Property: Negative endSeconds fails validation
   * For any segment with negative endSeconds (and non-negative startSeconds),
   * the segment schema SHALL return { valid: false } with appropriate error message.
   */
  it('returns valid=false when endSeconds is negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: -1_000_000, max: -1 }),
        segmentTypeArb,
        (start, end, type) => {
          const segment: Segment = {
            id: 'test-id',
            itemId: 'test-item',
            type,
            startSeconds: start,
            endSeconds: end,
          }

          const result = validateSegmentValues(segment)
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
   * Property: Validation is consistent across all segment types
   * For any segment type, the validation logic SHALL behave consistently
   * based only on startSeconds and endSeconds values.
   */
  it('validates consistently across all segment types', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 1001, max: 2000 }),
        (start, end) => {
          // Test all segment types with the same start/end values
          const results = SEGMENT_TYPES.map((type) => {
            const segment: Segment = {
              id: 'test-id',
              itemId: 'test-item',
              type,
              startSeconds: start,
              endSeconds: end,
            }
            return validateSegmentValues(segment)
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
   * For any segment with startSeconds just 1 less than endSeconds,
   * the segment schema SHALL return { valid: true }.
   */
  it('accepts minimal valid gap (endSeconds = startSeconds + 1)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        segmentTypeArb,
        (start, type) => {
          const segment: Segment = {
            id: 'test-id',
            itemId: 'test-item',
            type,
            startSeconds: start,
            endSeconds: start + 1, // Minimal valid gap
          }

          const result = validateSegmentValues(segment)
          return result.valid === true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Zero values are valid when properly ordered
   * For segment with startSeconds=0 and endSeconds>0, validation SHALL pass.
   */
  it('accepts zero startSeconds with positive endSeconds', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        segmentTypeArb,
        (end, type) => {
          const segment: Segment = {
            id: 'test-id',
            itemId: 'test-item',
            type,
            startSeconds: 0,
            endSeconds: end,
          }

          const result = validateSegmentValues(segment)
          return result.valid === true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: End beyond the media duration is rejected
   * For any segment whose endSeconds exceeds maxDuration, validation SHALL fail
   * with the duration error.
   */
  it('rejects segments whose end exceeds max duration', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        segmentTypeArb,
        (maxDuration, overshoot, type) => {
          const segment: Segment = {
            id: 'test-id',
            itemId: 'test-item',
            type,
            startSeconds: 0,
            endSeconds: maxDuration + overshoot,
          }

          const result = validateSegmentValues(segment, maxDuration)
          return (
            result.valid === false &&
            result.error === 'End time exceeds media duration'
          )
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Ordered segments inside the media duration pass
   * For any segment with 0 <= startSeconds < endSeconds <= maxDuration,
   * validation SHALL return { valid: true }.
   */
  it('accepts ordered segments within max duration', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 1_000_000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        segmentTypeArb,
        (maxDuration, startRatio, endRatio, type) => {
          const start = Math.floor(startRatio * (maxDuration - 1))
          const end =
            start + 1 + Math.floor(endRatio * (maxDuration - start - 1))
          const segment: Segment = {
            id: 'test-id',
            itemId: 'test-item',
            type,
            startSeconds: start,
            endSeconds: end,
          }

          const result = validateSegmentValues(segment, maxDuration)
          return result.valid === true
        },
      ),
      { numRuns: 100 },
    )
  })
})
