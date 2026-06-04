import type { MediaSegmentDto } from '@/types/jellyfin'

export interface SegmentTimeRange {
  segment: MediaSegmentDto
  startSeconds: number
  endSeconds: number
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

export function buildSegmentTimeRanges(
  segments: ReadonlyArray<MediaSegmentDto> | undefined,
): Array<SegmentTimeRange> {
  if (!segments || segments.length === 0) return []

  const ranges: Array<SegmentTimeRange> = []
  for (const segment of segments) {
    const startSeconds = getSegmentStart(segment)
    const endSeconds = getSegmentEnd(segment)
    if (!isFiniteNumber(startSeconds) || !isFiniteNumber(endSeconds)) {
      continue
    }
    if (endSeconds > startSeconds) {
      ranges.push({ segment, startSeconds, endSeconds })
    }
  }

  return ranges.sort((a, b) => a.startSeconds - b.startSeconds)
}

export function buildSegmentTimeRangeById(
  ranges: ReadonlyArray<SegmentTimeRange>,
): Map<string, SegmentTimeRange> {
  const map = new Map<string, SegmentTimeRange>()
  for (const range of ranges) {
    if (range.segment.Id !== undefined) {
      map.set(range.segment.Id, range)
    }
  }
  return map
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
