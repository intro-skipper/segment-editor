import { describe, expect, it } from 'vitest'

import type { BaseItemDto } from '@/types/jellyfin'
import { DEFAULT_FRAME_STEP, PLAYER_CONFIG } from '@/lib/constants'
import { resolveFrameStepSeconds } from '@/lib/frame-rate-utils'
import {
  formatSkipDurationLabel,
  getSkipStepSeconds,
  isFrameSkipSeconds,
} from '@/lib/player-timing-utils'

function createItemWithVideoFrameRate(frameRate: number): BaseItemDto {
  return {
    MediaSources: [
      {
        MediaStreams: [
          {
            Type: 'Video',
            RealFrameRate: frameRate,
          },
        ],
      },
    ],
  } as unknown as BaseItemDto
}

describe('player timing utilities', () => {
  it('resolves frame-step skip sentinel to frame duration via getSkipStepSeconds', () => {
    const frameStep = 1001 / 24000
    // Index 0 → sentinel (0) → resolved to frame duration
    expect(getSkipStepSeconds(0, frameStep)).toBeCloseTo(frameStep, 9)
    // Index 2 → 1s → returned as-is
    expect(getSkipStepSeconds(2, frameStep)).toBe(1)
  })

  it('gets skip step from config and handles out-of-range index safely', () => {
    const frameStep = 1001 / 24000
    expect(getSkipStepSeconds(0, frameStep)).toBeCloseTo(frameStep, 9)

    const defaultSkip =
      PLAYER_CONFIG.SKIP_TIMES[PLAYER_CONFIG.DEFAULT_SKIP_TIME_INDEX]
    expect(getSkipStepSeconds(-1, frameStep)).toBe(defaultSkip)
    expect(getSkipStepSeconds(999, frameStep)).toBe(defaultSkip)
  })

  it('formats skip labels consistently', () => {
    expect(isFrameSkipSeconds(0)).toBe(true)
    expect(isFrameSkipSeconds(0.5)).toBe(false)
    expect(formatSkipDurationLabel(0)).toBe('1f')
    expect(formatSkipDurationLabel(0.5)).toBe('0.5s')
  })

  it('resolves frame step from media metadata with fallback', () => {
    const item = createItemWithVideoFrameRate(24000 / 1001)
    expect(resolveFrameStepSeconds(item)).toBeCloseTo(1001 / 24000, 9)
    expect(resolveFrameStepSeconds({} as BaseItemDto)).toBeCloseTo(
      DEFAULT_FRAME_STEP,
      9,
    )
  })
})
