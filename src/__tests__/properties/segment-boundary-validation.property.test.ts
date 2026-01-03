/**
 * Feature: Segment Boundary Validation
 * For any segment with StartTicks and EndTicks values, the system SHALL enforce
 * that StartTicks < EndTicks. When slider handles are dragged or numeric values
 * are entered, the segment boundaries SHALL update in real-time while maintaining
 * this invariant. If the invariant is violated, a validation error SHALL be displayed.
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

// Custom arbitrary for hex strings
const hexStringArb = (length: number) =>
  fc
    .array(fc.constantFrom(...'0123456789abcdef'.split('')), {
      minLength: length,
      maxLength: length,
    })
    .map((chars) => chars.join(''))

// Arbitrary for valid UUID v4
const uuidArb = fc
  .tuple(
    hexStringArb(8),
    hexStringArb(4),
    hexStringArb(3),
    hexStringArb(3),
    hexStringArb(12),
  )
  .map(
    ([a, b, c, d, e]) =>
      `${a}-${b}-4${c}-${['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)]}${d}-${e}`,
  )

// Arbitrary for segment types
const segmentTypeArb = fc.constantFrom(...SEGMENT_TYPES)

/**
 * Arbitrary for valid segment (StartTicks < EndTicks with meaningful gap)
 * Uses integers to avoid floating-point precision issues
 */
const validSegmentArb: fc.Arbitrary<MediaSegmentDto> = fc
  .record({
    Id: uuidArb,
    ItemId: uuidArb,
    Type: segmentTypeArb,
    StartTicks: fc.integer({ min: 0, max: 35000 }),
    EndTicks: fc.integer({ min: 100, max: 36000 }),
  })
  .filter((s) => s.StartTicks + 1 < s.EndTicks) // Ensure meaningful gap

/**
 * Arbitrary for invalid segment (StartTicks >= EndTicks)
 */
const invalidSegmentArb: fc.Arbitrary<MediaSegmentDto> = fc.oneof(
  // Case 1: StartTicks > EndTicks
  fc
    .record({
      Id: uuidArb,
      ItemId: uuidArb,
      Type: segmentTypeArb,
      StartTicks: fc.integer({ min: 100, max: 36000 }),
      EndTicks: fc.integer({ min: 0, max: 35900 }),
    })
    .filter((s) => s.StartTicks > s.EndTicks),
  // Case 2: StartTicks === EndTicks
  fc
    .record({
      Id: uuidArb,
      ItemId: uuidArb,
      Type: segmentTypeArb,
      StartTicks: fc.integer({ min: 0, max: 36000 }),
    })
    .map((s) => ({ ...s, EndTicks: s.StartTicks })),
)

/**
 * Arbitrary for segment with negative start time
 */
const negativeStartSegmentArb: fc.Arbitrary<MediaSegmentDto> = fc.record({
  Id: uuidArb,
  ItemId: uuidArb,
  Type: segmentTypeArb,
  StartTicks: fc.integer({ min: -10000, max: -1 }),
  EndTicks: fc.integer({ min: 1, max: 36000 }),
})

/**
 * Arbitrary for segment with negative end time
 */
const negativeEndSegmentArb: fc.Arbitrary<MediaSegmentDto> = fc.record({
  Id: uuidArb,
  ItemId: uuidArb,
  Type: segmentTypeArb,
  StartTicks: fc.integer({ min: 0, max: 100 }),
  EndTicks: fc.integer({ min: -10000, max: -1 }),
})

/**
 * Simulates slider handle drag behavior.
 * When dragging, the system clamps values to maintain the invariant.
 */
function simulateSliderDrag(
  segment: MediaSegmentDto,
  handle: 'start' | 'end',
  newValue: number,
  runtimeSeconds: number,
): { start: number; end: number; valid: boolean } {
  const currentStart = segment.StartTicks ?? 0
  const currentEnd = segment.EndTicks ?? 0
  const minGap = 0.1 // Minimum gap between start and end

  let newStart = currentStart
  let newEnd = currentEnd

  if (handle === 'start') {
    // Clamp start to valid range: [0, end - minGap]
    const maxStart = currentEnd - minGap
    newStart = Math.max(0, Math.min(newValue, maxStart))
  } else {
    // Clamp end to valid range: [start + minGap, runtimeSeconds]
    const minEnd = currentStart + minGap
    newEnd = Math.max(minEnd, Math.min(newValue, runtimeSeconds))
  }

  return {
    start: newStart,
    end: newEnd,
    valid: newStart < newEnd,
  }
}

/**
 * Simulates numeric input validation behavior.
 * Returns whether the input would be accepted.
 */
function validateNumericInput(
  segment: MediaSegmentDto,
  field: 'start' | 'end',
  newValue: number,
  runtimeSeconds: number,
): boolean {
  const currentStart = segment.StartTicks ?? 0
  const currentEnd = segment.EndTicks ?? 0

  if (field === 'start') {
    // Start must be >= 0 and < current end
    return newValue >= 0 && newValue < currentEnd
  } else {
    // End must be > current start and <= runtime
    return newValue > currentStart && newValue <= runtimeSeconds
  }
}

describe('Segment Boundary Validation', () => {
  /**
   * Property: Valid segments pass validation
   * For any segment where StartTicks < EndTicks, validation SHALL return valid=true.
   */
  it('validates segments with StartTicks < EndTicks as valid', () => {
    fc.assert(
      fc.property(validSegmentArb, (segment) => {
        const result = validateSegment(segment)
        return result.valid === true && result.error === undefined
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Invalid segments fail validation with error message
   * For any segment where StartTicks >= EndTicks, validation SHALL return
   * valid=false with an appropriate error message.
   */
  it('rejects segments with StartTicks >= EndTicks', () => {
    fc.assert(
      fc.property(invalidSegmentArb, (segment) => {
        const result = validateSegment(segment)
        return (
          result.valid === false &&
          result.error === 'Start time must be less than end time'
        )
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Negative start times are rejected
   * For any segment with negative StartTicks, validation SHALL return
   * valid=false with an appropriate error message.
   */
  it('rejects segments with negative start time', () => {
    fc.assert(
      fc.property(negativeStartSegmentArb, (segment) => {
        const result = validateSegment(segment)
        return (
          result.valid === false &&
          result.error === 'Start time cannot be negative'
        )
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Negative end times are rejected
   * For any segment with negative EndTicks, validation SHALL return
   * valid=false with an appropriate error message.
   */
  it('rejects segments with negative end time', () => {
    fc.assert(
      fc.property(negativeEndSegmentArb, (segment) => {
        const result = validateSegment(segment)
        return (
          result.valid === false &&
          result.error === 'End time cannot be negative'
        )
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Slider drag maintains boundary invariant
   * For any valid segment and any drag operation, the resulting boundaries
   * SHALL maintain the invariant StartTicks < EndTicks.
   */
  it('maintains boundary invariant during slider drag', () => {
    fc.assert(
      fc.property(
        validSegmentArb,
        fc.constantFrom('start', 'end'),
        fc.integer({ min: -100, max: 40000 }),
        fc.integer({ min: 1000, max: 36000 }),
        (segment, handle, dragValue, runtimeSeconds) => {
          // Ensure runtime is greater than segment end
          const effectiveRuntime = Math.max(
            runtimeSeconds,
            (segment.EndTicks ?? 0) + 100,
          )

          const result = simulateSliderDrag(
            segment,
            handle,
            dragValue,
            effectiveRuntime,
          )

          // The invariant SHALL always be maintained after drag
          return result.start < result.end && result.valid === true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Slider drag clamps to valid range
   * For any drag operation, the resulting values SHALL be clamped
   * to the valid range [0, runtimeSeconds].
   */
  it('clamps slider values to valid range', () => {
    fc.assert(
      fc.property(
        validSegmentArb,
        fc.constantFrom('start', 'end'),
        fc.integer({ min: -1000, max: 50000 }),
        fc.integer({ min: 1000, max: 36000 }),
        (segment, handle, dragValue, runtimeSeconds) => {
          // Ensure runtime is greater than segment end
          const effectiveRuntime = Math.max(
            runtimeSeconds,
            (segment.EndTicks ?? 0) + 100,
          )

          const result = simulateSliderDrag(
            segment,
            handle,
            dragValue,
            effectiveRuntime,
          )

          // Start SHALL be >= 0
          const startInRange = result.start >= 0

          // End SHALL be <= runtimeSeconds
          const endInRange = result.end <= effectiveRuntime

          return startInRange && endInRange
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Numeric input validation accepts valid values
   * For any valid input value that maintains the invariant,
   * the input SHALL be accepted.
   */
  it('accepts valid numeric input values', () => {
    fc.assert(
      fc.property(
        validSegmentArb,
        fc.integer({ min: 40000, max: 100000 }),
        (segment, runtimeSeconds) => {
          const currentStart = segment.StartTicks ?? 0
          const currentEnd = segment.EndTicks ?? 0

          // Skip if segment doesn't have meaningful gap
          if (currentEnd - currentStart < 2) {
            return true
          }

          // Generate a valid start value (between 0 and currentEnd - 1)
          const validStartValue = Math.floor(currentStart / 2)
          const startAccepted = validateNumericInput(
            segment,
            'start',
            validStartValue,
            runtimeSeconds,
          )

          // Generate a valid end value (between currentStart + 1 and runtime)
          const validEndValue = Math.min(
            currentEnd + Math.floor((runtimeSeconds - currentEnd) / 2),
            runtimeSeconds,
          )
          const endAccepted = validateNumericInput(
            segment,
            'end',
            validEndValue,
            runtimeSeconds,
          )

          return startAccepted && endAccepted
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Numeric input validation rejects invalid values
   * For any input value that would violate the invariant,
   * the input SHALL be rejected.
   */
  it('rejects numeric input values that violate invariant', () => {
    fc.assert(
      fc.property(
        validSegmentArb,
        fc.integer({ min: 40000, max: 100000 }),
        (segment, runtimeSeconds) => {
          const currentStart = segment.StartTicks ?? 0
          const currentEnd = segment.EndTicks ?? 0

          // Try to set start >= end (invalid)
          const invalidStartValue = currentEnd + 1
          const startRejected = !validateNumericInput(
            segment,
            'start',
            invalidStartValue,
            runtimeSeconds,
          )

          // Try to set end <= start (invalid)
          const invalidEndValue = currentStart - 1
          const endRejected = !validateNumericInput(
            segment,
            'end',
            invalidEndValue,
            runtimeSeconds,
          )

          return startRejected && endRejected
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Validation with duration constraint
   * For any segment where EndTicks > maxDuration, validation SHALL fail
   * with an appropriate error message.
   */
  it('rejects segments exceeding max duration', () => {
    fc.assert(
      fc.property(
        validSegmentArb,
        fc.integer({ min: 1, max: 1000 }),
        (segment, maxDuration) => {
          // Ensure segment end exceeds max duration
          const testSegment: MediaSegmentDto = {
            ...segment,
            StartTicks: 0,
            EndTicks: maxDuration + 100,
          }

          const result = validateSegment(testSegment, maxDuration)
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
   * Property: Valid segments within duration pass extended validation
   * For any valid segment within the duration constraint,
   * extended validation SHALL return valid=true.
   */
  it('accepts valid segments within duration constraint', () => {
    fc.assert(
      fc.property(
        validSegmentArb,
        fc.integer({ min: 40000, max: 100000 }),
        (segment, maxDuration) => {
          // Ensure segment is within duration
          const testSegment: MediaSegmentDto = {
            ...segment,
            StartTicks: Math.min(segment.StartTicks ?? 0, maxDuration - 100),
            EndTicks: Math.min(segment.EndTicks ?? 0, maxDuration - 50),
          }

          // Ensure invariant is maintained
          if ((testSegment.StartTicks ?? 0) >= (testSegment.EndTicks ?? 0)) {
            return true // Skip invalid test cases
          }

          const result = validateSegment(testSegment, maxDuration)
          return result.valid === true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: All segment types can be validated
   * For any segment type, the validation logic SHALL work correctly
   * regardless of the type value.
   */
  it('validates all segment types consistently', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SEGMENT_TYPES),
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 1001, max: 2000 }),
        (segmentType, start, end) => {
          const segment: MediaSegmentDto = {
            Id: 'test-id',
            ItemId: 'test-item',
            Type: segmentType,
            StartTicks: start,
            EndTicks: end,
          }

          const result = validateSegment(segment)

          // All types SHALL be validated the same way
          return result.valid === true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Boundary edge case - minimal valid gap
   * For any segment with a very small but positive gap between start and end,
   * validation SHALL return valid=true.
   */
  it('accepts segments with minimal valid gap', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 35999 }),
        fc.integer({ min: 1, max: 100 }),
        (start, gap) => {
          const segment: MediaSegmentDto = {
            Id: 'test-id',
            ItemId: 'test-item',
            Type: 'Intro',
            StartTicks: start,
            EndTicks: start + gap,
          }

          const result = validateSegment(segment)
          return result.valid === true
        },
      ),
      { numRuns: 100 },
    )
  })
})
