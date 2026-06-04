import type { MediaSegmentDto } from '@/types/jellyfin'

export interface SegmentTimeRange {
  segment: MediaSegmentDto
  startSeconds: number
  endSeconds: number
}

export interface SegmentTimeIndex {
  ranges: Array<SegmentTimeRange>
  rangeById: Map<string, SegmentTimeRange>
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

// NOTE: Segment query layer (`services/segments/api.ts`) maps server ticks to
// UI seconds but preserves DTO field names (`StartTicks`/`EndTicks`).
/** Returns UI-second start time stored in the DTO's StartTicks field. */
const getSegmentStart = (segment: MediaSegmentDto): number | undefined =>
  segment.StartTicks

/** Returns UI-second end time stored in the DTO's EndTicks field. */
const getSegmentEnd = (segment: MediaSegmentDto): number | undefined =>
  segment.EndTicks

export function buildSegmentTimeIndex(
  segments: ReadonlyArray<MediaSegmentDto> | undefined,
): SegmentTimeIndex {
  const ranges: Array<SegmentTimeRange> = []
  const rangeById = new Map<string, SegmentTimeRange>()
  if (!segments || segments.length === 0) return { ranges, rangeById }

  for (const segment of segments) {
    const startSeconds = getSegmentStart(segment)
    const endSeconds = getSegmentEnd(segment)
    if (!isFiniteNumber(startSeconds) || !isFiniteNumber(endSeconds)) {
      continue
    }
    if (endSeconds > startSeconds) {
      const range = { segment, startSeconds, endSeconds }
      ranges.push(range)
      if (segment.Id !== undefined) {
        rangeById.set(segment.Id, range)
      }
    }
  }

  ranges.sort((a, b) => a.startSeconds - b.startSeconds)
  return { ranges, rangeById }
}

export function buildSegmentTimeRanges(
  segments: ReadonlyArray<MediaSegmentDto> | undefined,
): Array<SegmentTimeRange> {
  return buildSegmentTimeIndex(segments).ranges
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

export function getSegmentTimeRangeId(range: SegmentTimeRange): string {
  return (
    range.segment.Id ??
    `${range.startSeconds}:${range.endSeconds}:${range.segment.Type ?? ''}`
  )
}

export function getSegmentSkipTargetEndSeconds(
  segment: MediaSegmentDto,
  range: SegmentTimeRange | undefined,
): number | null {
  const fallbackEndSeconds = getSegmentEnd(segment)
  const targetEndSeconds = isFiniteNumber(range?.endSeconds)
    ? range.endSeconds
    : fallbackEndSeconds

  return isFiniteNumber(targetEndSeconds) ? targetEndSeconds : null
}
