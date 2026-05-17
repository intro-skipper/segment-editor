import { describe, expect, it } from 'vitest'

import type { BaseItemDto } from '@/types/jellyfin'
import { DEFAULT_FRAME_STEP, PLAYER_CONFIG } from '@/lib/constants'
import { resolveFrameStepSeconds } from '@/lib/frame-rate-utils'
import {
  PLAYER_HOTKEYS,
  PLAYER_SHORTCUT_CHEATSHEET,
} from '@/lib/player-shortcuts'
import {
  formatSkipDurationLabel,
  getFrameStepTargetTime,
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

  it('computes one-frame seek targets with media bounds', () => {
    const frameStep = 1001 / 24000
    const frameAlignedTime = frameStep * 240

    expect(
      getFrameStepTargetTime(frameAlignedTime, -1, frameStep, 120),
    ).toBeCloseTo(frameAlignedTime - frameStep, 9)
    expect(
      getFrameStepTargetTime(frameAlignedTime, 1, frameStep, 120),
    ).toBeCloseTo(frameAlignedTime + frameStep, 9)
    expect(getFrameStepTargetTime(0.01, -1, frameStep, 120)).toBe(0)
    expect(getFrameStepTargetTime(119.99, 1, frameStep, 120)).toBe(120)
  })

  it('computes finite seek targets when media duration is unavailable', () => {
    const frameStep = 1001 / 24000
    const frameAlignedTime = frameStep * 240
    const forwardTarget = frameAlignedTime + frameStep

    const targetWithNanDuration = getFrameStepTargetTime(
      frameAlignedTime,
      1,
      frameStep,
      Number.NaN,
    )

    expect(Number.isFinite(targetWithNanDuration)).toBe(true)
    expect(targetWithNanDuration).toBeCloseTo(forwardTarget, 9)
    expect(
      getFrameStepTargetTime(
        frameAlignedTime,
        1,
        frameStep,
        Number.POSITIVE_INFINITY,
      ),
    ).toBeCloseTo(forwardTarget, 9)
    expect(getFrameStepTargetTime(frameAlignedTime, 1, frameStep, -1)).toBe(0)
  })

  it('snaps one-frame seek targets back to frame boundaries', () => {
    const frameStep = 1001 / 24000
    const offFrameTime = frameStep * 1.2

    expect(getFrameStepTargetTime(offFrameTime, -1, frameStep, 120)).toBe(0)
    expect(getFrameStepTargetTime(offFrameTime, 1, frameStep, 120)).toBeCloseTo(
      frameStep * 2,
      9,
    )
  })

  it('formats skip labels consistently', () => {
    expect(isFrameSkipSeconds(0)).toBe(true)
    expect(isFrameSkipSeconds(0.5)).toBe(false)
    expect(formatSkipDurationLabel(0)).toBe('1f')
    expect(formatSkipDurationLabel(0.5)).toBe('0.5s')
  })

  it('formats skip labels consistently from config', () => {
    PLAYER_CONFIG.SKIP_TIMES.forEach((skipTime) => {
      const isFrameSentinel = skipTime === 0

      expect(isFrameSkipSeconds(skipTime)).toBe(isFrameSentinel)

      const expectedLabel = isFrameSentinel ? '1f' : `${skipTime}s`
      expect(formatSkipDurationLabel(skipTime)).toBe(expectedLabel)
    })
  })

  it('resolves frame step from media metadata with fallback', () => {
    const item = createItemWithVideoFrameRate(24000 / 1001)
    expect(resolveFrameStepSeconds(item)).toBeCloseTo(1001 / 24000, 9)
    expect(resolveFrameStepSeconds({} as BaseItemDto)).toBeCloseTo(
      DEFAULT_FRAME_STEP,
      9,
    )
  })

  it('cheatsheet step frame and speed hotkeys match PLAYER_HOTKEYS', () => {
    const stepFrameHotkeys = PLAYER_SHORTCUT_CHEATSHEET.find(
      (entry) => entry.labelKey === 'shortcuts.stepFrameBackForward',
    )?.hotkeys
    const decreaseSpeedHotkeys = PLAYER_SHORTCUT_CHEATSHEET.find(
      (entry) => entry.labelKey === 'shortcuts.decreaseSpeed',
    )?.hotkeys
    const increaseSpeedHotkeys = PLAYER_SHORTCUT_CHEATSHEET.find(
      (entry) => entry.labelKey === 'shortcuts.increaseSpeed',
    )?.hotkeys

    expect(stepFrameHotkeys).toEqual([
      PLAYER_HOTKEYS.stepFrameBackward,
      PLAYER_HOTKEYS.stepFrameForward,
    ])
    expect(decreaseSpeedHotkeys).toEqual([PLAYER_HOTKEYS.decreaseSpeed])
    expect(increaseSpeedHotkeys).toEqual([PLAYER_HOTKEYS.increaseSpeed])
  })
})
