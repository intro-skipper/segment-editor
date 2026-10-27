import type { Segment } from '@/types/segment'

export interface SegmentTimeRange {
  segment: Segment
  startSeconds: number
  endSeconds: number
}

export interface SegmentTimeIndex {
  ranges: Array<SegmentTimeRange>
  rangeById: Map<string, SegmentTimeRange>
}

const isFiniteNumber = (value: number | null | undefined): value is number =>
  value !== null && value !== undefined && Number.isFinite(value)

export function buildSegmentTimeIndex(
  segments: ReadonlyArray<Segment> | undefined,
): SegmentTimeIndex {
  const ranges: Array<SegmentTimeRange> = []
  const rangeById = new Map<string, SegmentTimeRange>()
  if (!segments || segments.length === 0) return { ranges, rangeById }

  for (const segment of segments) {
    const { startSeconds, endSeconds } = segment
    if (!isFiniteNumber(startSeconds) || !isFiniteNumber(endSeconds)) {
      continue
    }
    if (endSeconds > startSeconds) {
      const range = { segment, startSeconds, endSeconds }
      ranges.push(range)
      rangeById.set(segment.id, range)
    }
  }

  ranges.sort((a, b) => a.startSeconds - b.startSeconds)
  return { ranges, rangeById }
}

export function findActiveSegmentRange(
  ranges: ReadonlyArray<SegmentTimeRange>,
  currentTime: number,
): SegmentTimeRange | null {
  if (!isFiniteNumber(currentTime) || ranges.length === 0) return null

  // Binary search to the last range whose startSeconds ≤ currentTime.
  let lo = 0
  let hi = ranges.length - 1
  while (lo <= hi) {
    const mid = lo + Math.floor((hi - lo) / 2)
    if (ranges[mid].startSeconds <= currentTime) {
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  // Walk backward so an earlier overlapping range can remain active after a
  // later nested range ends.
  for (let index = hi; index >= 0; index -= 1) {
    const candidate = ranges[index]
    if (currentTime < candidate.endSeconds) return candidate
  }

  return null
}

export function getSegmentSkipTargetEndSeconds(
  segment: Segment,
  range: SegmentTimeRange | undefined,
): number | null {
  const fallbackEndSeconds = segment.endSeconds
  const targetEndSeconds = isFiniteNumber(range?.endSeconds)
    ? range.endSeconds
    : fallbackEndSeconds

  return isFiniteNumber(targetEndSeconds) ? targetEndSeconds : null
}
