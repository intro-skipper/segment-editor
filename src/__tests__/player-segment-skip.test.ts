import { describe, expect, it } from 'vitest'

import {
  buildSegmentTimeRangeById,
  buildSegmentTimeRanges,
  findActiveSegmentRange,
  getSegmentSkipTargetEndSeconds,
  getSegmentTimeRangeId,
} from '@/components/player/segment-skip'
import type { MediaSegmentDto } from '@/types/jellyfin'

function segment(overrides: Partial<MediaSegmentDto>): MediaSegmentDto {
  return {
    ItemId: 'item-1',
    Type: 'Intro',
    ...overrides,
  } as MediaSegmentDto
}

describe('player segment skip helpers', () => {
  it('normalizes finite positive ranges and indexes them by id', () => {
    const intro = segment({ Id: 'intro', StartTicks: 30, EndTicks: 40 })
    const recap = segment({ Id: 'recap', StartTicks: 10, EndTicks: 20 })

    const ranges = buildSegmentTimeRanges([
      intro,
      segment({ Id: 'missing-start', EndTicks: 50 }),
      segment({ Id: 'equal-boundary', StartTicks: 50, EndTicks: 50 }),
      segment({ Id: 'invalid-end', StartTicks: 60, EndTicks: Number.NaN }),
      recap,
    ])

    expect(ranges.map((range) => range.segment.Id)).toEqual(['recap', 'intro'])
    expect(
      ranges.map((range) => [range.startSeconds, range.endSeconds]),
    ).toEqual([
      [10, 20],
      [30, 40],
    ])

    const rangeById = buildSegmentTimeRangeById(ranges)
    expect(rangeById.get('recap')?.segment).toBe(recap)
    expect(rangeById.get('intro')?.segment).toBe(intro)
    expect(rangeById.has('missing-start')).toBe(false)
  })

  it('finds the active segment by start-inclusive end-exclusive time', () => {
    const ranges = buildSegmentTimeRanges([
      segment({ Id: 'intro', StartTicks: 30, EndTicks: 40 }),
      segment({ Id: 'recap', StartTicks: 10, EndTicks: 20 }),
    ])

    expect(findActiveSegmentRange(ranges, 10)?.segment.Id).toBe('recap')
    expect(findActiveSegmentRange(ranges, 19.999)?.segment.Id).toBe('recap')
    expect(findActiveSegmentRange(ranges, 20)).toBeNull()
    expect(findActiveSegmentRange(ranges, 35)?.segment.Id).toBe('intro')
    expect(findActiveSegmentRange(ranges, Number.NaN)).toBeNull()
  })

  it('keeps an earlier overlapping segment active after a nested segment ends', () => {
    const ranges = buildSegmentTimeRanges([
      segment({ Id: 'outer', StartTicks: 0, EndTicks: 100 }),
      segment({ Id: 'nested', StartTicks: 50, EndTicks: 60 }),
    ])

    expect(findActiveSegmentRange(ranges, 55)?.segment.Id).toBe('nested')
    expect(findActiveSegmentRange(ranges, 70)?.segment.Id).toBe('outer')
  })

  it('resolves stable range ids and skip targets without an id', () => {
    const range = buildSegmentTimeRanges([
      segment({ Type: 'Outro', StartTicks: 70, EndTicks: 90 }),
    ])[0]

    expect(getSegmentTimeRangeId(range)).toBe('70:90:Outro')
    expect(getSegmentSkipTargetEndSeconds(range.segment, undefined)).toBe(90)
  })

  it('prefers the normalized indexed range end when skipping an identified segment', () => {
    const segmentWithStaleEnd = segment({
      Id: 'intro',
      StartTicks: 30,
      EndTicks: 31,
    })
    const normalizedRange = buildSegmentTimeRanges([
      { ...segmentWithStaleEnd, EndTicks: 40 },
    ])[0]

    expect(
      getSegmentSkipTargetEndSeconds(segmentWithStaleEnd, normalizedRange),
    ).toBe(40)
    expect(
      getSegmentSkipTargetEndSeconds(
        segment({ Id: 'missing-end', StartTicks: 10 }),
        undefined,
      ),
    ).toBeNull()
  })
})
