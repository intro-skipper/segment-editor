import { describe, expect, it } from 'vitest'

import { areSegmentListsEqual } from '@/lib/segment-utils'
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
})
