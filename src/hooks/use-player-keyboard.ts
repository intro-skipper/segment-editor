import { useHotkey } from '@tanstack/react-hotkeys'
import type { TimestampUpdate } from '@/types/segment'
import { PLAYER_HOTKEYS } from '@/lib/player-shortcuts'
import { usePlaybackEngine } from '@/components/player/playback-context'

interface PlayerKeyboardOptions {
  /** The skip size A and D move by. */
  skipTimeIndex: number
  onCycleSkipTime: (direction: 1 | -1) => void
  onUpdateSegmentTimestamp: (data: TimestampUpdate) => void
  onToggleFullscreen: () => void
}

/**
 * Binds the player shortcuts to the provider's engine: Space=Play, W/S=Skip
 * size, A/D=Skip, ,/.=Frame step, E/F=Timestamps, M=Mute, F11=Fullscreen,
 * C=Subtitles, Alt+./Alt+,=Speed.
 */
export function usePlayerKeyboard({
  skipTimeIndex,
  onCycleSkipTime,
  onUpdateSegmentTimestamp,
  onToggleFullscreen,
}: PlayerKeyboardOptions): void {
  const engine = usePlaybackEngine()
  const { playhead } = engine

  const pushTimestamp = (start: boolean) => {
    onUpdateSegmentTimestamp({ currentTime: playhead.getSnappedTime(), start })
  }

  // Single keys ignore inputs and prevent the default by default.
  useHotkey(PLAYER_HOTKEYS.togglePlay, engine.togglePlay)
  useHotkey(PLAYER_HOTKEYS.cycleSkipTimeUp, () => onCycleSkipTime(1))
  useHotkey(PLAYER_HOTKEYS.cycleSkipTimeDown, () => onCycleSkipTime(-1))
  useHotkey(PLAYER_HOTKEYS.skipBackward, () => playhead.skip(-1, skipTimeIndex))
  useHotkey(PLAYER_HOTKEYS.skipForward, () => playhead.skip(1, skipTimeIndex))
  useHotkey(PLAYER_HOTKEYS.stepFrameBackward, () => playhead.stepFrame(-1))
  useHotkey(PLAYER_HOTKEYS.stepFrameForward, () => playhead.stepFrame(1))
  useHotkey(PLAYER_HOTKEYS.pushStartTimestamp, () => pushTimestamp(true))
  useHotkey(PLAYER_HOTKEYS.pushEndTimestamp, () => pushTimestamp(false))
  useHotkey(PLAYER_HOTKEYS.toggleMute, engine.toggleMute)
  useHotkey(PLAYER_HOTKEYS.toggleFullscreen, onToggleFullscreen)
  useHotkey(PLAYER_HOTKEYS.toggleSubtitles, engine.tracks.toggleSubtitles)
  useHotkey(PLAYER_HOTKEYS.increaseSpeed, () => engine.cycleSpeed(1))
  useHotkey(PLAYER_HOTKEYS.decreaseSpeed, () => engine.cycleSpeed(-1))
}
