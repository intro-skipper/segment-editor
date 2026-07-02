import { describe, expect, it } from 'vitest'

import { areSegmentListsEqual, resolveSegmentIndex } from '@/lib/segment-utils'
import type { MediaSegmentDto } from '@/types/jellyfin'

function segment(overrides: Partial<MediaSegmentDto> = {}): MediaSegmentDto {
  return {
    Id: 'segment-1',
    ItemId: 'item-1',
    Type: 'Intro',
    StartTicks: 10,
    EndTicks: 25,
    ...overrides,
  }
}

describe('areSegmentListsEqual', () => {
  it('treats two empty lists as equal', () => {
    expect(areSegmentListsEqual([], [])).toBe(true)
  })

  it('treats identical lists as equal', () => {
    const a = [segment(), segment({ Id: 'segment-2', StartTicks: 30 })]
    const b = [segment(), segment({ Id: 'segment-2', StartTicks: 30 })]

    expect(areSegmentListsEqual(a, b)).toBe(true)
  })

  it('detects differing lengths', () => {
    expect(areSegmentListsEqual([segment()], [])).toBe(false)
    expect(areSegmentListsEqual([], [segment()])).toBe(false)
  })

  it('detects a changed Id', () => {
    expect(
      areSegmentListsEqual([segment()], [segment({ Id: 'segment-2' })]),
    ).toBe(false)
  })

  it('detects a changed Type', () => {
    expect(
      areSegmentListsEqual([segment()], [segment({ Type: 'Commercial' })]),
    ).toBe(false)
  })

  it('detects changed StartTicks or EndTicks', () => {
    expect(
      areSegmentListsEqual([segment()], [segment({ StartTicks: 11 })]),
    ).toBe(false)
    expect(areSegmentListsEqual([segment()], [segment({ EndTicks: 26 })])).toBe(
      false,
    )
  })

  it('is order-sensitive', () => {
    const first = segment()
    const second = segment({ Id: 'segment-2', StartTicks: 30, EndTicks: 40 })

    expect(areSegmentListsEqual([first, second], [second, first])).toBe(false)
  })

  it('ignores fields outside Id/Type/StartTicks/EndTicks', () => {
    expect(
      areSegmentListsEqual([segment()], [segment({ ItemId: 'item-2' })]),
    ).toBe(true)
  })

  it('treats missing elements as unequal instead of throwing', () => {
    const withUndefined = [
      segment(),
      undefined,
    ] as unknown as Array<MediaSegmentDto>
    const complete = [segment(), segment({ Id: 'segment-2' })]

    expect(areSegmentListsEqual(withUndefined, complete)).toBe(false)
    expect(areSegmentListsEqual(complete, withUndefined)).toBe(false)

    const sparse = new Array<MediaSegmentDto>(2)
    sparse[0] = segment()
    expect(areSegmentListsEqual(sparse, complete)).toBe(false)
  })
})

describe('resolveSegmentIndex', () => {
  const segments = [
    segment({ Id: 'segment-1' }),
    segment({ Id: 'segment-2', StartTicks: 30, EndTicks: 40 }),
    segment({ Id: 'segment-3', StartTicks: 50, EndTicks: 60 }),
  ]

  it('resolves by Id even when the captured index is stale', () => {
    expect(resolveSegmentIndex(segments, { id: 'segment-3', index: 0 })).toBe(2)
  })

  it('returns -1 when the referenced Id no longer exists', () => {
    expect(resolveSegmentIndex(segments, { id: 'segment-9', index: 1 })).toBe(
      -1,
    )
  })

  it('falls back to the captured index when no Id is available', () => {
    expect(resolveSegmentIndex(segments, { index: 1 })).toBe(1)
  })

  it('returns -1 for an out-of-bounds fallback index', () => {
    expect(resolveSegmentIndex(segments, { index: 3 })).toBe(-1)
    expect(resolveSegmentIndex(segments, { index: -1 })).toBe(-1)
  })
})
