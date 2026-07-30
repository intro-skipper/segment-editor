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

const { SKIP_TIMES, PLAYBACK_SPEEDS } = PLAYER_CONFIG

/** Arbitrary for generating valid PlayerState */
const playerStateArb: fc.Arbitrary<PlayerState> = fc.record({
  isPlaying: fc.boolean(),
  volume: fc.float({ min: 0, max: 1, noNaN: true }),
  isMuted: fc.boolean(),
  skipTimeIndex: fc.integer({ min: 0, max: SKIP_TIMES.length - 1 }),
  subtitleOffset: fc.float({ min: -30, max: 30, noNaN: true }),
  playbackSpeedIndex: fc.integer({ min: 0, max: PLAYBACK_SPEEDS.length - 1 }),
})

describe('Reducer Reference Stability', () => {
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
   * Property: State values are preserved for unchanged fields
   * When an action changes one field, all other fields should remain unchanged.
   */
  it('preserves unchanged fields when updating state', () => {
    fc.assert(
      fc.property(
        playerStateArb,
        fc.float({ min: -30, max: 30, noNaN: true }),
        (state, newOffset) => {
          fc.pre(newOffset !== state.subtitleOffset)
          const action: PlayerAction = {
            type: 'SUBTITLE_OFFSET_CHANGE',
            offset: newOffset,
          }
          const result = playerReducer(state, action)
          return (
            result.isPlaying === state.isPlaying &&
            result.volume === state.volume &&
            result.isMuted === state.isMuted &&
            result.skipTimeIndex === state.skipTimeIndex &&
            result.subtitleOffset === newOffset &&
            result.playbackSpeedIndex === state.playbackSpeedIndex
          )
        },
      ),
      { numRuns: 100 },
    )
  })
})
