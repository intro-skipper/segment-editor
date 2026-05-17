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
  stepFrameBackward: ',',
  stepFrameForward: '.',
  pushStartTimestamp: 'E',
  pushEndTimestamp: 'F',
  toggleMute: 'M',
  toggleFullscreen: 'F11',
  toggleSubtitles: 'C',
  increaseSpeed: 'Alt+.',
  decreaseSpeed: 'Alt+,',
} as const

/** Display-friendly cheatsheet — a superset of PLAYER_HOTKEYS.
 *  Includes shortcuts registered in PlayerEditor (Mod+S, [, ]) that
 *  are not part of usePlayerKeyboard. */
export const PLAYER_SHORTCUT_CHEATSHEET = Object.freeze([
  // togglePlay uses { key } shape because useHotkey receives it as a KeyboardEvent.key value
  { labelKey: 'shortcuts.playPause', hotkeys: [PLAYER_HOTKEYS.togglePlay.key] },
  {
    labelKey: 'shortcuts.skipBackForward',
    hotkeys: [PLAYER_HOTKEYS.skipBackward, PLAYER_HOTKEYS.skipForward],
  },
  {
    labelKey: 'shortcuts.changeSkipTime',
    hotkeys: [PLAYER_HOTKEYS.cycleSkipTimeUp, PLAYER_HOTKEYS.cycleSkipTimeDown],
  },
  {
    labelKey: 'shortcuts.setStartTime',
    hotkeys: [PLAYER_HOTKEYS.pushStartTimestamp],
  },
  {
    labelKey: 'shortcuts.setEndTime',
    hotkeys: [PLAYER_HOTKEYS.pushEndTimestamp],
  },
  { labelKey: 'shortcuts.toggleMute', hotkeys: [PLAYER_HOTKEYS.toggleMute] },
  {
    labelKey: 'shortcuts.toggleFullscreen',
    hotkeys: [PLAYER_HOTKEYS.toggleFullscreen],
  },
  {
    labelKey: 'shortcuts.toggleSubtitles',
    hotkeys: [PLAYER_HOTKEYS.toggleSubtitles],
  },
  { labelKey: 'shortcuts.saveAll', hotkeys: ['Mod+S'] },
  { labelKey: 'shortcuts.prevSegment', hotkeys: ['['] },
  { labelKey: 'shortcuts.nextSegment', hotkeys: [']'] },
  {
    labelKey: 'shortcuts.stepFrameBackForward',
    hotkeys: [
      PLAYER_HOTKEYS.stepFrameBackward,
      PLAYER_HOTKEYS.stepFrameForward,
    ],
  },
  {
    labelKey: 'shortcuts.increaseSpeed',
    hotkeys: [PLAYER_HOTKEYS.increaseSpeed],
  },
  {
    labelKey: 'shortcuts.decreaseSpeed',
    hotkeys: [PLAYER_HOTKEYS.decreaseSpeed],
  },
] as const)
