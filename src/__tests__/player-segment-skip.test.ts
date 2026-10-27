import { describe, expect, it } from 'vitest'

import {
  buildSegmentTimeIndex,
  findActiveSegmentRange,
  getSegmentSkipTargetEndSeconds,
  getSegmentTimeRangeId,
} from '@/services/video/segment-skip'
import type { Segment } from '@/types/segment'

function segment(
  overrides: Partial<Segment> & Pick<Segment, 'startSeconds' | 'endSeconds'>,
): Segment {
  return {
    itemId: 'item-1',
    type: 'Intro',
    ...overrides,
  }
}

describe('player segment skip helpers', () => {
  it('normalizes finite positive ranges and indexes them by id', () => {
    const intro = segment({ id: 'intro', startSeconds: 30, endSeconds: 40 })
    const recap = segment({ id: 'recap', startSeconds: 10, endSeconds: 20 })

    const { ranges, rangeById } = buildSegmentTimeIndex([
      intro,
      segment({ id: 'equal-boundary', startSeconds: 50, endSeconds: 50 }),
      segment({ id: 'invalid-end', startSeconds: 60, endSeconds: Number.NaN }),
      recap,
    ])

    expect(ranges.map((range) => range.segment.id)).toEqual(['recap', 'intro'])
    expect(
      ranges.map((range) => [range.startSeconds, range.endSeconds]),
    ).toEqual([
      [10, 20],
      [30, 40],
    ])

    expect(rangeById.get('recap')?.segment).toBe(recap)
    expect(rangeById.get('intro')?.segment).toBe(intro)
    expect(rangeById.has('invalid-end')).toBe(false)
  })

  it('finds the active segment by start-inclusive end-exclusive time', () => {
    const ranges = buildSegmentTimeIndex([
      segment({ id: 'intro', startSeconds: 30, endSeconds: 40 }),
      segment({ id: 'recap', startSeconds: 10, endSeconds: 20 }),
    ]).ranges

    expect(findActiveSegmentRange(ranges, 10)?.segment.id).toBe('recap')
    expect(findActiveSegmentRange(ranges, 19.999)?.segment.id).toBe('recap')
    expect(findActiveSegmentRange(ranges, 20)).toBeNull()
    expect(findActiveSegmentRange(ranges, 35)?.segment.id).toBe('intro')
    expect(findActiveSegmentRange(ranges, Number.NaN)).toBeNull()
  })

  it('keeps an earlier overlapping segment active after a nested segment ends', () => {
    const ranges = buildSegmentTimeIndex([
      segment({ id: 'outer', startSeconds: 0, endSeconds: 100 }),
      segment({ id: 'nested', startSeconds: 50, endSeconds: 60 }),
    ]).ranges

    expect(findActiveSegmentRange(ranges, 55)?.segment.id).toBe('nested')
    expect(findActiveSegmentRange(ranges, 70)?.segment.id).toBe('outer')
  })

  it('resolves stable range ids and skip targets without an id', () => {
    const range = buildSegmentTimeIndex([
      segment({ type: 'Outro', startSeconds: 70, endSeconds: 90 }),
    ]).ranges[0]

    expect(getSegmentTimeRangeId(range)).toBe('70:90:Outro')
    expect(getSegmentSkipTargetEndSeconds(range.segment, undefined)).toBe(90)
  })

  it('prefers the normalized indexed range end when skipping an identified segment', () => {
    const segmentWithStaleEnd = segment({
      id: 'intro',
      startSeconds: 30,
      endSeconds: 31,
    })
    const normalizedRange = buildSegmentTimeIndex([
      { ...segmentWithStaleEnd, endSeconds: 40 },
    ]).ranges[0]

    expect(
      getSegmentSkipTargetEndSeconds(segmentWithStaleEnd, normalizedRange),
    ).toBe(40)
    expect(
      getSegmentSkipTargetEndSeconds(
        segment({
          id: 'invalid-end',
          startSeconds: 10,
          endSeconds: Number.NaN,
        }),
        undefined,
      ),
    ).toBeNull()
  })
})
