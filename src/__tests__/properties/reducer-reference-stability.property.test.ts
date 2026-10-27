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
const playerStateArb: fc.Arbitrary<PlayerState> = fc.record({
  skipTimeIndex: fc.integer({ min: 0, max: SKIP_TIMES.length - 1 }),
})

describe('Reducer Reference Stability', () => {
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
})
