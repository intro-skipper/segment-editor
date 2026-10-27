/**
 * Player reducer - the player's UI state. Playback state (play state,
 * volume, speed) lives in the playback engine.
 */

import { PLAYER_CONFIG } from '@/lib/constants'

const { SKIP_TIMES, DEFAULT_SKIP_TIME_INDEX } = PLAYER_CONFIG

export interface PlayerState {
  /** The skip size the skip shortcuts move by, an index into SKIP_TIMES. */
  skipTimeIndex: number
  /** User-configured subtitle offset in seconds (positive = delay, negative = advance) */
  subtitleOffset: number
}

export type PlayerAction =
  | { type: 'SKIP_TIME_CHANGE'; skipTimeIndex: number }
  | { type: 'CYCLE_SKIP'; direction: 1 | -1 }
  | { type: 'SUBTITLE_OFFSET_CHANGE'; offset: number }
  | { type: 'RESET' }

export const initialPlayerState: PlayerState = {
  skipTimeIndex: DEFAULT_SKIP_TIME_INDEX,
  subtitleOffset: 0,
}

/** Returns the same reference when state is unchanged to prevent unnecessary re-renders. */
export function playerReducer(
  state: PlayerState,
  action: PlayerAction,
): PlayerState {
  switch (action.type) {
    case 'SKIP_TIME_CHANGE':
      return state.skipTimeIndex === action.skipTimeIndex
        ? state
        : { ...state, skipTimeIndex: action.skipTimeIndex }

    case 'CYCLE_SKIP': {
      const newIndex = Math.max(
        0,
        Math.min(SKIP_TIMES.length - 1, state.skipTimeIndex + action.direction),
      )
      return newIndex === state.skipTimeIndex
        ? state
        : { ...state, skipTimeIndex: newIndex }
    }

    case 'SUBTITLE_OFFSET_CHANGE':
      return state.subtitleOffset === action.offset
        ? state
        : { ...state, subtitleOffset: action.offset }

    case 'RESET':
      return initialPlayerState
  }
}
