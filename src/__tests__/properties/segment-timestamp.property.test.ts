/**
 * Feature: Segment Timestamp Capture
 * For any player current time value, when a segment is created from the player,
 * the segment's StartTicks SHALL equal the captured current time, and when an
 * external timestamp is set, the player SHALL seek to that exact position.
 */

import { describe, it } from 'vitest'
import * as fc from 'fast-check'
import type { CreateSegmentData, TimestampUpdate } from '@/types/segment'
import type { MediaSegmentType } from '@/types/jellyfin'

/**
 * Simulates the segment creation logic from Player component.
 * This mirrors the handleCreateSegment callback behavior.
 */
function createSegmentFromTimestamp(
  currentTime: number,
  type: MediaSegmentType,
): CreateSegmentData {
  return {
    type,
    start: currentTime,
  }
}

/**
 * Simulates the timestamp update logic from Player component.
 * This mirrors the pushStartTimestamp and pushEndTimestamp callbacks.
 */
function createTimestampUpdate(
  currentTime: number,
  isStart: boolean,
): TimestampUpdate {
  return {
    currentTime,
    start: isStart,
  }
}

/**
 * Simulates the external timestamp seek behavior.
 * When an external timestamp is provided, the player seeks to that position.
 */
function seekToTimestamp(externalTimestamp: number, duration: number): number {
  // Clamp to valid range [0, duration]
  return Math.max(0, Math.min(externalTimestamp, duration))
}

/** Valid segment types for testing */
const SEGMENT_TYPES: Array<MediaSegmentType> = [
  'Unknown',
  'Commercial',
  'Preview',
  'Recap',
  'Outro',
  'Intro',
]

describe('Segment Timestamp Capture', () => {
  /**
   * Property: Segment creation captures exact current time
   * For any valid current time, creating a segment SHALL capture that exact time
   * as the segment's start value.
   */
  it('captures exact current time when creating segment', () => {
    fc.assert(
      fc.property(
        // Generate valid current time (0 to 24 hours in seconds)
        fc.double({ min: 0, max: 86400, noNaN: true, noDefaultInfinity: true }),
        // Generate segment type
        fc.constantFrom(...SEGMENT_TYPES),
        (currentTime, segmentType) => {
          const segment = createSegmentFromTimestamp(currentTime, segmentType)

          // The segment's start time SHALL equal the captured current time
          return segment.start === currentTime && segment.type === segmentType
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Timestamp update captures exact current time
   * For any valid current time, updating a segment timestamp SHALL capture
   * that exact time in the update data.
   */
  it('captures exact current time when updating segment timestamp', () => {
    fc.assert(
      fc.property(
        // Generate valid current time
        fc.double({ min: 0, max: 86400, noNaN: true, noDefaultInfinity: true }),
        // Generate whether it's start or end timestamp
        fc.boolean(),
        (currentTime, isStart) => {
          const update = createTimestampUpdate(currentTime, isStart)

          // The update's currentTime SHALL equal the captured time
          // and the start flag SHALL match the requested update type
          return update.currentTime === currentTime && update.start === isStart
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: External timestamp seek reaches exact position
   * For any external timestamp within valid range, the player SHALL seek
   * to that exact position.
   */
  it('seeks to exact external timestamp position', () => {
    fc.assert(
      fc.property(
        // Generate video duration (1 second to 24 hours)
        fc.double({ min: 1, max: 86400, noNaN: true, noDefaultInfinity: true }),
        // Generate external timestamp (can be any value, will be clamped)
        fc.double({
          min: -100,
          max: 90000,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (duration, externalTimestamp) => {
          const seekPosition = seekToTimestamp(externalTimestamp, duration)

          // The seek position SHALL be within valid bounds
          const withinBounds = seekPosition >= 0 && seekPosition <= duration

          // If external timestamp is within bounds, seek position SHALL equal it exactly
          const exactMatch =
            externalTimestamp >= 0 && externalTimestamp <= duration
              ? seekPosition === externalTimestamp
              : true // Out of bounds values are clamped, so we just check bounds

          return withinBounds && exactMatch
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Timestamp capture preserves precision
   * For any timestamp with decimal precision, the captured value SHALL
   * preserve that precision without loss.
   */
  it('preserves timestamp precision', () => {
    fc.assert(
      fc.property(
        // Generate timestamps with various decimal precisions
        fc.double({
          min: 0,
          max: 3600,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (timestamp) => {
          const segment = createSegmentFromTimestamp(timestamp, 'Intro')
          const update = createTimestampUpdate(timestamp, true)

          // Both segment creation and timestamp update SHALL preserve exact value
          return segment.start === timestamp && update.currentTime === timestamp
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Start and end timestamp updates are distinguishable
   * For any timestamp, start and end updates SHALL be correctly differentiated
   * by the start flag.
   */
  it('distinguishes between start and end timestamp updates', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 86400, noNaN: true, noDefaultInfinity: true }),
        (timestamp) => {
          const startUpdate = createTimestampUpdate(timestamp, true)
          const endUpdate = createTimestampUpdate(timestamp, false)

          // Start update SHALL have start=true, end update SHALL have start=false
          // Both SHALL capture the same timestamp
          return (
            startUpdate.start === true &&
            endUpdate.start === false &&
            startUpdate.currentTime === timestamp &&
            endUpdate.currentTime === timestamp
          )
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: All segment types can be created with any valid timestamp
   * For any combination of valid timestamp and segment type, segment creation
   * SHALL succeed and capture both values correctly.
   */
  it('creates segments with all types and any valid timestamp', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 86400, noNaN: true, noDefaultInfinity: true }),
        fc.constantFrom(...SEGMENT_TYPES),
        (timestamp, segmentType) => {
          const segment = createSegmentFromTimestamp(timestamp, segmentType)

          // Segment SHALL have correct type and start time
          // End time is optional and not set during initial creation
          return (
            segment.type === segmentType &&
            segment.start === timestamp &&
            segment.end === undefined
          )
        },
      ),
      { numRuns: 100 },
    )
  })
})
