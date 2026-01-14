/**
 * Player reducer - State management for video player component.
 * Extracted for testability and separation of concerns.
 */

import type { HlsPlayerError } from '@/hooks/use-hls-player'
import { PLAYER_CONFIG } from '@/lib/constants'

const { SKIP_TIMES, DEFAULT_SKIP_TIME_INDEX } = PLAYER_CONFIG

/**
 * Player state managed by reducer.
 * Simplified to focus on playback state only - HLS management moved to useHlsPlayer.
 */
export interface PlayerState {
  isPlaying: boolean
  currentTime: number
  duration: number
  buffered: number
  volume: number
  isMuted: boolean
  skipTimeIndex: number
  playerError: HlsPlayerError | null
  isRecovering: boolean
  /** User-configured subtitle offset in seconds (positive = delay, negative = advance) */
  subtitleOffset: number
}

/** Consolidated action types for better efficiency */
export type PlayerAction =
  | { type: 'PLAYBACK_UPDATE'; currentTime: number }
  | { type: 'MEDIA_LOADED'; duration: number }
  | { type: 'BUFFER_UPDATE'; buffered: number }
  | { type: 'PLAY_STATE'; isPlaying: boolean }
  | { type: 'VOLUME_CHANGE'; volume: number; isMuted: boolean }
  | { type: 'SKIP_TIME_CHANGE'; skipTimeIndex: number }
  | { type: 'ERROR_STATE'; error: HlsPlayerError | null; isRecovering: boolean }
  | { type: 'RECOVERY_START' }
  | { type: 'CYCLE_SKIP'; direction: 1 | -1 }
  | { type: 'SUBTITLE_OFFSET_CHANGE'; offset: number }

export const initialPlayerState: PlayerState = {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  buffered: 0,
  volume: 1,
  isMuted: false,
  skipTimeIndex: DEFAULT_SKIP_TIME_INDEX,
  playerError: null,
  isRecovering: false,
  subtitleOffset: 0,
}

/**
 * Simplified player reducer with consolidated action types.
 * Returns the same reference when state is unchanged to prevent unnecessary re-renders.
 */
export function playerReducer(
  state: PlayerState,
  action: PlayerAction,
): PlayerState {
  switch (action.type) {
    case 'PLAYBACK_UPDATE':
      return state.currentTime === action.currentTime
        ? state
        : { ...state, currentTime: action.currentTime }

    case 'MEDIA_LOADED':
      return state.duration === action.duration
        ? state
        : { ...state, duration: action.duration }

    case 'BUFFER_UPDATE':
      return state.buffered === action.buffered
        ? state
        : { ...state, buffered: action.buffered }

    case 'PLAY_STATE':
      return state.isPlaying === action.isPlaying
        ? state
        : { ...state, isPlaying: action.isPlaying }

    case 'VOLUME_CHANGE':
      return state.volume === action.volume && state.isMuted === action.isMuted
        ? state
        : { ...state, volume: action.volume, isMuted: action.isMuted }

    case 'SKIP_TIME_CHANGE':
      return state.skipTimeIndex === action.skipTimeIndex
        ? state
        : { ...state, skipTimeIndex: action.skipTimeIndex }

    case 'ERROR_STATE':
      return {
        ...state,
        playerError: action.error,
        isRecovering: action.isRecovering,
      }

    case 'RECOVERY_START':
      return { ...state, isRecovering: true }

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
  }
}
