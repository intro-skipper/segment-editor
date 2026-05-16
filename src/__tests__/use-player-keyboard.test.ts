/**
 * @vitest-environment jsdom
 */

import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePlayerKeyboard } from '@/hooks/use-player-keyboard'
import { PLAYER_HOTKEYS } from '@/lib/player-shortcuts'

const { useHotkeyMock } = vi.hoisted(() => ({
  useHotkeyMock: vi.fn(),
}))

vi.mock('@tanstack/react-hotkeys', () => ({
  useHotkey: useHotkeyMock,
}))

describe('usePlayerKeyboard', () => {
  beforeEach(() => {
    useHotkeyMock.mockReset()
  })

  it('registers frame-step and playback speed hotkeys from shared shortcut constants', () => {
    const handler = vi.fn()

    renderHook(() =>
      usePlayerKeyboard({
        togglePlay: handler,
        cycleSkipTimeUp: handler,
        cycleSkipTimeDown: handler,
        skipBackward: handler,
        skipForward: handler,
        stepFrameBackward: handler,
        stepFrameForward: handler,
        pushStartTimestamp: handler,
        pushEndTimestamp: handler,
        toggleMute: handler,
        toggleFullscreen: handler,
        toggleSubtitles: handler,
        increaseSpeed: handler,
        decreaseSpeed: handler,
      }),
    )

    expect(useHotkeyMock).toHaveBeenCalledWith(
      PLAYER_HOTKEYS.stepFrameBackward,
      handler,
    )
    expect(useHotkeyMock).toHaveBeenCalledWith(
      PLAYER_HOTKEYS.stepFrameForward,
      handler,
    )
    expect(useHotkeyMock).toHaveBeenCalledWith(
      PLAYER_HOTKEYS.increaseSpeed,
      handler,
    )
    expect(useHotkeyMock).toHaveBeenCalledWith(
      PLAYER_HOTKEYS.decreaseSpeed,
      handler,
    )
  })
})
