/**
 * Feature: direct-play-fallback, Property 5: State Preservation Round-Trip
 *
 * For any playback state (currentTime, volume, muted, paused) before a strategy switch,
 * the state after the switch SHALL be equivalent to the state before
 * (within acceptable tolerance for currentTime).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as fc from 'fast-check'
import type { PlaybackState } from '@/services/video/playback-state'
import {
  capturePlaybackState,
  restorePlaybackState,
} from '@/services/video/playback-state'

// Mock video element for testing
function createMockVideoElement(
  initialState: Partial<PlaybackState> = {},
): HTMLVideoElement {
  const state = {
    currentTime: initialState.currentTime ?? 0,
    volume: initialState.volume ?? 1,
    muted: initialState.muted ?? false,
    paused: initialState.paused ?? true,
    readyState: 4, // HAVE_ENOUGH_DATA
  }

  const mockVideo = {
    get currentTime() {
      return state.currentTime
    },
    set currentTime(value: number) {
      state.currentTime = value
    },
    get volume() {
      return state.volume
    },
    set volume(value: number) {
      state.volume = Math.max(0, Math.min(1, value))
    },
    get muted() {
      return state.muted
    },
    set muted(value: boolean) {
      state.muted = value
    },
    get paused() {
      return state.paused
    },
    get readyState() {
      return state.readyState
    },
    play: vi.fn().mockImplementation(() => {
      state.paused = false
      return Promise.resolve()
    }),
    pause: vi.fn().mockImplementation(() => {
      state.paused = true
    }),
  }

  return mockVideo as unknown as HTMLVideoElement
}

describe('Feature: direct-play-fallback, Property 5: State Preservation Round-Trip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Arbitrary for valid currentTime (0 to 10 hours in seconds)
  const currentTimeArb = fc.double({
    min: 0,
    max: 36000,
    noNaN: true,
    noDefaultInfinity: true,
  })

  // Arbitrary for volume (0 to 1)
  const volumeArb = fc.double({
    min: 0,
    max: 1,
    noNaN: true,
    noDefaultInfinity: true,
  })

  // Arbitrary for boolean states
  const booleanArb = fc.boolean()

  // Arbitrary for complete playback state
  const playbackStateArb = fc.record({
    currentTime: currentTimeArb,
    volume: volumeArb,
    muted: booleanArb,
    paused: booleanArb,
  })

  /**
   * Property: capturePlaybackState captures all state properties
   * For any video element state, capturePlaybackState should capture all four properties
   */
  it('preserveState captures all state properties', () => {
    fc.assert(
      fc.property(playbackStateArb, (state) => {
        const video = createMockVideoElement(state)
        const preserved = capturePlaybackState(video)

        expect(preserved.currentTime).toBe(state.currentTime)
        expect(preserved.volume).toBe(state.volume)
        expect(preserved.muted).toBe(state.muted)
        expect(preserved.paused).toBe(state.paused)
        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: restorePlaybackState applies all state properties
   * For any preserved state, restorePlaybackState should apply all properties to the video element
   */
  it('restoreState applies all state properties', async () => {
    await fc.assert(
      fc.asyncProperty(playbackStateArb, async (state) => {
        const video = createMockVideoElement()
        await restorePlaybackState(video, state)

        expect(video.currentTime).toBe(state.currentTime)
        expect(video.volume).toBe(state.volume)
        expect(video.muted).toBe(state.muted)

        // If state was not paused, play should have been called
        if (!state.paused) {
          expect(video.play).toHaveBeenCalled()
        }
        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Round-trip preserves currentTime
   * For any currentTime, preserve then restore should result in the same value
   */
  it('round-trip preserves currentTime', async () => {
    await fc.assert(
      fc.asyncProperty(currentTimeArb, async (currentTime) => {
        const sourceVideo = createMockVideoElement({ currentTime })
        const preserved = capturePlaybackState(sourceVideo)

        const targetVideo = createMockVideoElement()
        await restorePlaybackState(targetVideo, preserved)

        expect(targetVideo.currentTime).toBe(currentTime)
        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Round-trip preserves volume
   * For any volume, preserve then restore should result in the same value
   */
  it('round-trip preserves volume', async () => {
    await fc.assert(
      fc.asyncProperty(volumeArb, async (volume) => {
        const sourceVideo = createMockVideoElement({ volume })
        const preserved = capturePlaybackState(sourceVideo)

        const targetVideo = createMockVideoElement()
        await restorePlaybackState(targetVideo, preserved)

        expect(targetVideo.volume).toBe(volume)
        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Round-trip preserves muted state
   * For any muted state, preserve then restore should result in the same value
   */
  it('round-trip preserves muted state', async () => {
    await fc.assert(
      fc.asyncProperty(booleanArb, async (muted) => {
        const sourceVideo = createMockVideoElement({ muted })
        const preserved = capturePlaybackState(sourceVideo)

        const targetVideo = createMockVideoElement()
        await restorePlaybackState(targetVideo, preserved)

        expect(targetVideo.muted).toBe(muted)
        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Round-trip preserves paused state
   * For any paused state, preserve then restore should trigger appropriate action
   */
  it('round-trip preserves paused state', async () => {
    await fc.assert(
      fc.asyncProperty(booleanArb, async (paused) => {
        const sourceVideo = createMockVideoElement({ paused })
        const preserved = capturePlaybackState(sourceVideo)

        const targetVideo = createMockVideoElement({ paused: true })
        await restorePlaybackState(targetVideo, preserved)

        // If source was playing (not paused), play should be called
        if (!paused) {
          expect(targetVideo.play).toHaveBeenCalled()
        } else {
          expect(targetVideo.play).not.toHaveBeenCalled()
        }
        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Complete round-trip preserves all state
   * For any complete playback state, preserve then restore should result in equivalent state
   */
  it('complete round-trip preserves all state', async () => {
    await fc.assert(
      fc.asyncProperty(playbackStateArb, async (state) => {
        const sourceVideo = createMockVideoElement(state)
        const preserved = capturePlaybackState(sourceVideo)

        const targetVideo = createMockVideoElement()
        await restorePlaybackState(targetVideo, preserved)

        // Verify all properties match
        expect(targetVideo.currentTime).toBe(state.currentTime)
        expect(targetVideo.volume).toBe(state.volume)
        expect(targetVideo.muted).toBe(state.muted)

        // Verify play/pause behavior
        if (!state.paused) {
          expect(targetVideo.play).toHaveBeenCalled()
        }

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: capturePlaybackState handles null video element
   * When video is null, capturePlaybackState should return default state
   */
  it('preserveState handles null video element', () => {
    const preserved = capturePlaybackState(null)

    expect(preserved.currentTime).toBe(0)
    expect(preserved.volume).toBe(1)
    expect(preserved.muted).toBe(false)
    expect(preserved.paused).toBe(true)
  })

  /**
   * Property: restorePlaybackState handles null video element gracefully
   * When video is null, restorePlaybackState should not throw
   */
  it('restoreState handles null video element gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(playbackStateArb, async (state) => {
        // Should not throw
        await expect(restorePlaybackState(null, state)).resolves.not.toThrow()
        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Volume is clamped to valid range
   * Volume values outside 0-1 should be clamped
   */
  it('volume is clamped to valid range', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true }),
        async (volume) => {
          const video = createMockVideoElement()
          await restorePlaybackState(video, {
            currentTime: 0,
            volume,
            muted: false,
            paused: true,
          })

          // Volume should be clamped to 0-1
          expect(video.volume).toBeGreaterThanOrEqual(0)
          expect(video.volume).toBeLessThanOrEqual(1)
          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Preserved state is immutable
   * Modifying the source video after preserve should not affect preserved state
   */
  it('preserved state is immutable', () => {
    fc.assert(
      fc.property(playbackStateArb, playbackStateArb, (state1, state2) => {
        const video = createMockVideoElement(state1)
        const preserved = capturePlaybackState(video)

        // Modify the video
        video.currentTime = state2.currentTime
        video.volume = state2.volume
        video.muted = state2.muted

        // Preserved state should still have original values
        expect(preserved.currentTime).toBe(state1.currentTime)
        expect(preserved.volume).toBe(state1.volume)
        expect(preserved.muted).toBe(state1.muted)
        expect(preserved.paused).toBe(state1.paused)
        return true
      }),
      { numRuns: 100 },
    )
  })
})
