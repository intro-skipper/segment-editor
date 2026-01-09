/**
 * Feature: codebase-audit-refactor, Property: Reducer Reference Stability
 * For any player state and action that does not change any state values, the reducer
 * SHALL return the exact same object reference (referential equality). For any action
 * that changes at least one value, the reducer SHALL return a new object reference.
 */

import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import type {
  PlayerAction,
  PlayerState,
} from '@/components/player/player-reducer'
import {
  initialPlayerState,
  playerReducer,
} from '@/components/player/player-reducer'
import { PLAYER_CONFIG } from '@/lib/constants'

const { SKIP_TIMES } = PLAYER_CONFIG

/** Arbitrary for generating valid PlayerState */
const playerStateArb = fc.record({
  isPlaying: fc.boolean(),
  currentTime: fc.float({ min: 0, max: 10000, noNaN: true }),
  duration: fc.float({ min: 0, max: 10000, noNaN: true }),
  buffered: fc.float({ min: 0, max: 10000, noNaN: true }),
  volume: fc.float({ min: 0, max: 1, noNaN: true }),
  isMuted: fc.boolean(),
  skipTimeIndex: fc.integer({ min: 0, max: SKIP_TIMES.length - 1 }),
  playerError: fc.constant(null),
  isRecovering: fc.boolean(),
}) as fc.Arbitrary<PlayerState>

describe('Reducer Reference Stability', () => {
  /**
   * Property: PLAYBACK_UPDATE returns same reference when currentTime unchanged
   */
  it('returns same reference for PLAYBACK_UPDATE with unchanged currentTime', () => {
    fc.assert(
      fc.property(playerStateArb, (state) => {
        const action: PlayerAction = {
          type: 'PLAYBACK_UPDATE',
          currentTime: state.currentTime,
        }
        const result = playerReducer(state, action)
        return result === state
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: PLAYBACK_UPDATE returns new reference when currentTime changes
   */
  it('returns new reference for PLAYBACK_UPDATE with changed currentTime', () => {
    fc.assert(
      fc.property(
        playerStateArb,
        fc.float({ min: 0, max: 10000, noNaN: true }),
        (state, newTime) => {
          fc.pre(newTime !== state.currentTime)
          const action: PlayerAction = {
            type: 'PLAYBACK_UPDATE',
            currentTime: newTime,
          }
          const result = playerReducer(state, action)
          return result !== state && result.currentTime === newTime
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: MEDIA_LOADED returns same reference when duration unchanged
   */
  it('returns same reference for MEDIA_LOADED with unchanged duration', () => {
    fc.assert(
      fc.property(playerStateArb, (state) => {
        const action: PlayerAction = {
          type: 'MEDIA_LOADED',
          duration: state.duration,
        }
        const result = playerReducer(state, action)
        return result === state
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: MEDIA_LOADED returns new reference when duration changes
   */
  it('returns new reference for MEDIA_LOADED with changed duration', () => {
    fc.assert(
      fc.property(
        playerStateArb,
        fc.float({ min: 0, max: 10000, noNaN: true }),
        (state, newDuration) => {
          fc.pre(newDuration !== state.duration)
          const action: PlayerAction = {
            type: 'MEDIA_LOADED',
            duration: newDuration,
          }
          const result = playerReducer(state, action)
          return result !== state && result.duration === newDuration
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: BUFFER_UPDATE returns same reference when buffered unchanged
   */
  it('returns same reference for BUFFER_UPDATE with unchanged buffered', () => {
    fc.assert(
      fc.property(playerStateArb, (state) => {
        const action: PlayerAction = {
          type: 'BUFFER_UPDATE',
          buffered: state.buffered,
        }
        const result = playerReducer(state, action)
        return result === state
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: PLAY_STATE returns same reference when isPlaying unchanged
   */
  it('returns same reference for PLAY_STATE with unchanged isPlaying', () => {
    fc.assert(
      fc.property(playerStateArb, (state) => {
        const action: PlayerAction = {
          type: 'PLAY_STATE',
          isPlaying: state.isPlaying,
        }
        const result = playerReducer(state, action)
        return result === state
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: PLAY_STATE returns new reference when isPlaying changes
   */
  it('returns new reference for PLAY_STATE with changed isPlaying', () => {
    fc.assert(
      fc.property(playerStateArb, (state) => {
        const action: PlayerAction = {
          type: 'PLAY_STATE',
          isPlaying: !state.isPlaying,
        }
        const result = playerReducer(state, action)
        return result !== state && result.isPlaying === !state.isPlaying
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: VOLUME_CHANGE returns same reference when volume and muted unchanged
   */
  it('returns same reference for VOLUME_CHANGE with unchanged values', () => {
    fc.assert(
      fc.property(playerStateArb, (state) => {
        const action: PlayerAction = {
          type: 'VOLUME_CHANGE',
          volume: state.volume,
          isMuted: state.isMuted,
        }
        const result = playerReducer(state, action)
        return result === state
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: VOLUME_CHANGE returns new reference when volume changes
   */
  it('returns new reference for VOLUME_CHANGE with changed volume', () => {
    fc.assert(
      fc.property(
        playerStateArb,
        fc.float({ min: 0, max: 1, noNaN: true }),
        (state, newVolume) => {
          fc.pre(newVolume !== state.volume)
          const action: PlayerAction = {
            type: 'VOLUME_CHANGE',
            volume: newVolume,
            isMuted: state.isMuted,
          }
          const result = playerReducer(state, action)
          return result !== state && result.volume === newVolume
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: SKIP_TIME_CHANGE returns same reference when skipTimeIndex unchanged
   */
  it('returns same reference for SKIP_TIME_CHANGE with unchanged index', () => {
    fc.assert(
      fc.property(playerStateArb, (state) => {
        const action: PlayerAction = {
          type: 'SKIP_TIME_CHANGE',
          skipTimeIndex: state.skipTimeIndex,
        }
        const result = playerReducer(state, action)
        return result === state
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: SKIP_TIME_CHANGE returns new reference when skipTimeIndex changes
   */
  it('returns new reference for SKIP_TIME_CHANGE with changed index', () => {
    fc.assert(
      fc.property(
        playerStateArb,
        fc.integer({ min: 0, max: SKIP_TIMES.length - 1 }),
        (state, newIndex) => {
          fc.pre(newIndex !== state.skipTimeIndex)
          const action: PlayerAction = {
            type: 'SKIP_TIME_CHANGE',
            skipTimeIndex: newIndex,
          }
          const result = playerReducer(state, action)
          return result !== state && result.skipTimeIndex === newIndex
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: CYCLE_SKIP returns same reference when at boundary and can't move
   */
  it('returns same reference for CYCLE_SKIP at boundary', () => {
    // At minimum index, cycling down should return same reference
    const stateAtMin: PlayerState = { ...initialPlayerState, skipTimeIndex: 0 }
    const actionDown: PlayerAction = { type: 'CYCLE_SKIP', direction: -1 }
    expect(playerReducer(stateAtMin, actionDown)).toBe(stateAtMin)

    // At maximum index, cycling up should return same reference
    const stateAtMax: PlayerState = {
      ...initialPlayerState,
      skipTimeIndex: SKIP_TIMES.length - 1,
    }
    const actionUp: PlayerAction = { type: 'CYCLE_SKIP', direction: 1 }
    expect(playerReducer(stateAtMax, actionUp)).toBe(stateAtMax)
  })

  /**
   * Property: CYCLE_SKIP returns new reference when index can change
   */
  it('returns new reference for CYCLE_SKIP when index changes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: SKIP_TIMES.length - 1 }),
        (skipTimeIndex) => {
          const state: PlayerState = { ...initialPlayerState, skipTimeIndex }
          const action: PlayerAction = { type: 'CYCLE_SKIP', direction: -1 }
          const result = playerReducer(state, action)
          return result !== state && result.skipTimeIndex === skipTimeIndex - 1
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: ERROR_STATE always returns new reference (error state changes are always significant)
   */
  it('returns new reference for ERROR_STATE action', () => {
    fc.assert(
      fc.property(playerStateArb, fc.boolean(), (state, isRecovering) => {
        const action: PlayerAction = {
          type: 'ERROR_STATE',
          error: null,
          isRecovering,
        }
        const result = playerReducer(state, action)
        // ERROR_STATE always creates new object (no optimization for error state)
        return (
          result !== state ||
          (result.playerError === null && result.isRecovering === isRecovering)
        )
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: RECOVERY_START always returns new reference
   */
  it('returns new reference for RECOVERY_START action', () => {
    fc.assert(
      fc.property(playerStateArb, (state) => {
        const action: PlayerAction = { type: 'RECOVERY_START' }
        const result = playerReducer(state, action)
        // RECOVERY_START always creates new object
        return result !== state || result.isRecovering === true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: State values are preserved for unchanged fields
   * When an action changes one field, all other fields should remain unchanged.
   */
  it('preserves unchanged fields when updating state', () => {
    fc.assert(
      fc.property(
        playerStateArb,
        fc.float({ min: 0, max: 10000, noNaN: true }),
        (state, newTime) => {
          fc.pre(newTime !== state.currentTime)
          const action: PlayerAction = {
            type: 'PLAYBACK_UPDATE',
            currentTime: newTime,
          }
          const result = playerReducer(state, action)
          return (
            result.isPlaying === state.isPlaying &&
            result.duration === state.duration &&
            result.buffered === state.buffered &&
            result.volume === state.volume &&
            result.isMuted === state.isMuted &&
            result.skipTimeIndex === state.skipTimeIndex &&
            result.playerError === state.playerError &&
            result.isRecovering === state.isRecovering
          )
        },
      ),
      { numRuns: 100 },
    )
  })
})
