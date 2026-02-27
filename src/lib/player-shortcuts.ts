/**
 * Shared shortcut definitions for player controls and shortcut UI.
 */

/** Hotkey registrations used by usePlayerKeyboard. */
export const PLAYER_HOTKEYS = {
  togglePlay: { key: 'Space' },
  cycleSkipTimeUp: 'W',
  cycleSkipTimeDown: 'S',
  skipBackward: 'A',
  skipForward: 'D',
  pushStartTimestamp: 'E',
  pushEndTimestamp: 'F',
  toggleMute: 'M',
  toggleFullscreen: 'F11',
  toggleSubtitles: 'C',
  increaseSpeed: '.',
  decreaseSpeed: ',',
} as const

/** Display-friendly cheatsheet — a superset of PLAYER_HOTKEYS.
 *  Includes shortcuts registered in PlayerEditor (Mod+S, [, ]) that
 *  are not part of usePlayerKeyboard. */
export const PLAYER_SHORTCUT_CHEATSHEET = Object.freeze([
  // 'Space' is the display-friendly label; actual hotkey uses { key: ' ' }
  { labelKey: 'shortcuts.playPause', hotkeys: ['Space'] },
  { labelKey: 'shortcuts.skipBackForward', hotkeys: ['A', 'D'] },
  { labelKey: 'shortcuts.changeSkipTime', hotkeys: ['W', 'S'] },
  { labelKey: 'shortcuts.setStartTime', hotkeys: ['E'] },
  { labelKey: 'shortcuts.setEndTime', hotkeys: ['F'] },
  { labelKey: 'shortcuts.toggleMute', hotkeys: ['M'] },
  { labelKey: 'shortcuts.toggleFullscreen', hotkeys: ['F11'] },
  { labelKey: 'shortcuts.toggleSubtitles', hotkeys: ['C'] },
  { labelKey: 'shortcuts.saveAll', hotkeys: ['Mod+S'] },
  { labelKey: 'shortcuts.prevSegment', hotkeys: ['['] },
  { labelKey: 'shortcuts.nextSegment', hotkeys: [']'] },
  { labelKey: 'shortcuts.increaseSpeed', hotkeys: ['.'] },
  { labelKey: 'shortcuts.decreaseSpeed', hotkeys: [','] },
] as const)
