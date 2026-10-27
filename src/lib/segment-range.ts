/**
 * The rules a segment's range follows, in seconds: it lies inside the media,
 * runs at least MIN_SEGMENT_GAP, and its boundaries sit on frames. Every way
 * of editing a segment (slider, edit dialog, player, create, import) goes
 * through placeRange; typed and imported ranges are checked with rangeError.
 */

import { SEGMENT_CONFIG } from './constants'
import { snapToFrame } from './time-utils'

const { MIN_SEGMENT_GAP } = SEGMENT_CONFIG

export interface SegmentRange {
  start: number
  end: number
}

/** What the media allows. A runtime that is not positive and finite is unknown, so unbounded. */
export interface RangeRules {
  runtimeSeconds: number
  /** Boundaries snap to multiples of this; omitted or non-positive leaves them unsnapped. */
  frameStepSeconds?: number
}

/** The latest a segment may end. */
export const maxEndSeconds = ({ runtimeSeconds }: RangeRules): number =>
  Number.isFinite(runtimeSeconds) && runtimeSeconds > 0
    ? runtimeSeconds
    : Infinity

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max))

/**
 * Where `next` lands under the rules: boundaries snapped to frames, inside
 * the media, and at least MIN_SEGMENT_GAP apart. The boundary that `moved`
 * gives way to the other one; when both moved, the end gives way.
 */
export function placeRange(
  next: SegmentRange,
  rules: RangeRules,
  moved: 'start' | 'end' | 'both' = 'both',
): SegmentRange {
  const max = maxEndSeconds(rules)
  const snap = (seconds: number) => snapToFrame(seconds, rules.frameStepSeconds)

  if (moved === 'start') {
    return {
      start: clamp(snap(next.start), 0, next.end - MIN_SEGMENT_GAP),
      end: next.end,
    }
  }
  // An end-only move still pulls back a start that lies past the media.
  const start =
    moved === 'both' || next.start > max - MIN_SEGMENT_GAP
      ? clamp(snap(next.start), 0, Math.max(0, max - MIN_SEGMENT_GAP))
      : next.start
  // Staying inside the media wins over the minimum length.
  return {
    start,
    end: Math.min(max, Math.max(snap(next.end), start + MIN_SEGMENT_GAP)),
  }
}

/** Why a typed or imported range is unusable, or null when it is usable. */
export function rangeError(
  { start, end }: SegmentRange,
  rules: RangeRules,
): string | null {
  if (start < 0) return 'Start time cannot be negative'
  if (end < 0) return 'End time cannot be negative'
  if (start >= end) return 'Start time must be less than end time'
  if (end > maxEndSeconds(rules)) return 'End time exceeds media duration'
  return null
}
