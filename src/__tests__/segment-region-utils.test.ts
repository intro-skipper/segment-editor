import { describe, expect, it } from 'vitest'

import type { MediaSegmentDto } from '@/types/jellyfin'
import { MediaSegmentType } from '@/types/jellyfin'
import {
  getSegmentColor,
  getSegmentCssVar,
  getSegmentRegions,
} from '@/lib/segment-utils'

// StartTicks/EndTicks are in SECONDS at the UI boundary (see segments/api.ts)
const segment = (
  start: number,
  end: number,
  type: MediaSegmentType = MediaSegmentType.Intro,
  id = `seg-${start}-${end}`,
): MediaSegmentDto => ({
  Id: id,
  ItemId: 'item-1',
  Type: type,
  StartTicks: start,
  EndTicks: end,
})

describe('getSegmentRegions', () => {
  it('returns empty for missing segments or non-positive duration', () => {
    expect(getSegmentRegions(undefined, 100)).toEqual([])
    expect(getSegmentRegions([], 100)).toEqual([])
    expect(getSegmentRegions([segment(0, 10)], 0)).toEqual([])
    expect(getSegmentRegions([segment(0, 10)], -5)).toEqual([])
  })

  it('maps segments to percent-based regions with second bounds', () => {
    const regions = getSegmentRegions([segment(30, 90)], 300)

    expect(regions).toHaveLength(1)
    expect(regions[0].start).toBeCloseTo(10)
    expect(regions[0].width).toBeCloseTo(20)
    expect(regions[0].startSeconds).toBe(30)
    expect(regions[0].endSeconds).toBe(90)
    expect(regions[0].color).toBe('var(--segment-intro)')
  })

  it('clamps regions that extend beyond the runtime', () => {
    const regions = getSegmentRegions([segment(-10, 400)], 300)

    expect(regions).toHaveLength(1)
    expect(regions[0].start).toBe(0)
    expect(regions[0].width).toBe(100)
    expect(regions[0].startSeconds).toBe(0)
    expect(regions[0].endSeconds).toBe(300)
  })

  it('drops segments starting at or beyond the runtime', () => {
    expect(getSegmentRegions([segment(300, 360)], 300)).toEqual([])
    expect(getSegmentRegions([segment(500, 600)], 300)).toEqual([])
  })

  it('drops sub-0.1% regions by default (scrubber behavior)', () => {
    // 1s of a 24min episode is ~0.069% wide
    expect(getSegmentRegions([segment(10, 11)], 1440)).toEqual([])
  })

  it('widens tiny regions instead of dropping them when a minimum is set', () => {
    const regions = getSegmentRegions([segment(10, 11)], 1440, {
      minVisibleWidthPercent: 0.8,
    })

    expect(regions).toHaveLength(1)
    expect(regions[0].width).toBe(0.8)
    expect(regions[0].start).toBeCloseTo((10 / 1440) * 100)
  })

  it('shifts widened regions left at the track end so they stay in bounds', () => {
    const regions = getSegmentRegions([segment(1439, 1440)], 1440, {
      minVisibleWidthPercent: 0.8,
    })

    expect(regions).toHaveLength(1)
    expect(regions[0].width).toBe(0.8)
    expect(regions[0].start).toBeCloseTo(99.2)
    expect(regions[0].start + regions[0].width).toBeLessThanOrEqual(100)
  })

  it('still drops zero-width spans when a minimum is set', () => {
    expect(
      getSegmentRegions([segment(10, 10)], 1440, {
        minVisibleWidthPercent: 0.8,
      }),
    ).toEqual([])
  })

  it('treats missing ticks as 0 and clamps to the runtime', () => {
    const noStart: MediaSegmentDto = {
      Id: 'seg-no-start',
      ItemId: 'item-1',
      Type: MediaSegmentType.Intro,
      EndTicks: 400,
    }
    const regions = getSegmentRegions([noStart], 300)

    expect(regions).toHaveLength(1)
    expect(regions[0].start).toBe(0)
    expect(regions[0].width).toBe(100)
    expect(regions[0].startSeconds).toBe(0)
    expect(regions[0].endSeconds).toBe(300)
  })

  it('drops reversed spans (end before start) in both modes', () => {
    const reversed = segment(90, 30)
    const noEnd: MediaSegmentDto = {
      Id: 'seg-no-end',
      ItemId: 'item-1',
      Type: MediaSegmentType.Intro,
      StartTicks: 120,
    }

    expect(getSegmentRegions([reversed, noEnd], 300)).toEqual([])
    expect(
      getSegmentRegions([reversed, noEnd], 300, {
        minVisibleWidthPercent: 0.8,
      }),
    ).toEqual([])
  })

  it('falls back to the unknown color for untyped segments', () => {
    const untyped: MediaSegmentDto = {
      Id: 'seg-untyped',
      ItemId: 'item-1',
      StartTicks: 0,
      EndTicks: 50,
    }
    const regions = getSegmentRegions([untyped], 100)

    expect(regions).toHaveLength(1)
    expect(regions[0].color).toBe('var(--segment-unknown)')
  })

  it('does not crash on server enum values unknown to this client', () => {
    // A newer Jellyfin server may report types this client does not know;
    // the schema warning is logged but DTOs are still forwarded to the UI.
    const futureType: MediaSegmentDto = {
      Id: 'seg-future',
      ItemId: 'item-1',
      Type: 'HolidaySpecial' as MediaSegmentType,
      StartTicks: 10,
      EndTicks: 60,
    }
    const regions = getSegmentRegions([futureType], 100)

    expect(regions).toHaveLength(1)
    expect(regions[0].color).toBe('var(--segment-unknown)')
  })

  it('resolves helper colors safely for unknown types', () => {
    const futureType = 'HolidaySpecial' as MediaSegmentType

    expect(getSegmentColor(futureType)).toBe('bg-segment-unknown')
    expect(getSegmentCssVar(futureType)).toBe('var(--segment-unknown)')
    expect(getSegmentColor(undefined)).toBe('bg-segment-unknown')
    expect(getSegmentCssVar(undefined)).toBe('var(--segment-unknown)')
  })
})
