/**
 * usePlayerKeyboard - Custom hook for player keyboard shortcuts.
 * Uses @tanstack/react-hotkeys for type-safe, cross-platform hotkey management.
 */

import { useHotkey } from '@tanstack/react-hotkeys'
import { PLAYER_HOTKEYS } from '@/lib/player-shortcuts'

interface KeyboardHandlers {
  togglePlay: () => void
  cycleSkipTimeUp: () => void
  cycleSkipTimeDown: () => void
  skipBackward: () => void
  skipForward: () => void
  pushStartTimestamp: () => void
  pushEndTimestamp: () => void
  toggleMute: () => void
  toggleFullscreen: () => void
  toggleSubtitles: () => void
  increaseSpeed: () => void
  decreaseSpeed: () => void
}

/**
 * Key mappings:
 * Space=Play, W/S=Skip time, A/D=Skip, E/F=Timestamps,
 * M=Mute, F11=Fullscreen, C=Subtitles, Shift+>=Faster, Shift+<=Slower
 */
export function usePlayerKeyboard(handlers: KeyboardHandlers): void {
  // Single-key shortcuts: ignoreInputs defaults to true (smart default),
  // preventDefault defaults to true, automatic cleanup on unmount.
  useHotkey(PLAYER_HOTKEYS.togglePlay, handlers.togglePlay)
  useHotkey(PLAYER_HOTKEYS.cycleSkipTimeUp, handlers.cycleSkipTimeUp)
  useHotkey(PLAYER_HOTKEYS.cycleSkipTimeDown, handlers.cycleSkipTimeDown)
  useHotkey(PLAYER_HOTKEYS.skipBackward, handlers.skipBackward)
  useHotkey(PLAYER_HOTKEYS.skipForward, handlers.skipForward)
  useHotkey(PLAYER_HOTKEYS.pushStartTimestamp, handlers.pushStartTimestamp)
  useHotkey(PLAYER_HOTKEYS.pushEndTimestamp, handlers.pushEndTimestamp)
  useHotkey(PLAYER_HOTKEYS.toggleMute, handlers.toggleMute)
  useHotkey(PLAYER_HOTKEYS.toggleFullscreen, handlers.toggleFullscreen)
  useHotkey(PLAYER_HOTKEYS.toggleSubtitles, handlers.toggleSubtitles)
  useHotkey(PLAYER_HOTKEYS.increaseSpeed, handlers.increaseSpeed)
  useHotkey(PLAYER_HOTKEYS.decreaseSpeed, handlers.decreaseSpeed)
}
