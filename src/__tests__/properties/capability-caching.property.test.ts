/**
 * Feature: direct-play-fallback, Property 6: Capability Caching Idempotence
 *
 * For any codec string, calling isCodecSupported multiple times with the same codec
 * SHALL return the same result, and subsequent calls SHALL use cached values
 * (not re-query the browser APIs).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import {
  DIRECT_PLAY_AUDIO_CODECS,
  DIRECT_PLAY_VIDEO_CODECS,
  clearCache,
  getCacheSize,
  isCodecSupported,
} from '@/services/video/compatibility'

describe('Feature: direct-play-fallback, Property 6: Capability Caching Idempotence', () => {
  beforeEach(() => {
    clearCache()
  })

  /**
   * Property: Multiple calls with same codec return identical results
   * For any supported video codec, calling isCodecSupported multiple times
   * should always return the same boolean value.
   */
  it('returns identical results for repeated video codec checks', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...DIRECT_PLAY_VIDEO_CODECS),
        async (codec) => {
          clearCache()

          const result1 = await isCodecSupported(codec, 'video')
          const result2 = await isCodecSupported(codec, 'video')
          const result3 = await isCodecSupported(codec, 'video')

          return result1 === result2 && result2 === result3
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Multiple calls with same codec return identical results for audio
   * For any supported audio codec, calling isCodecSupported multiple times
   * should always return the same boolean value.
   */
  it('returns identical results for repeated audio codec checks', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...DIRECT_PLAY_AUDIO_CODECS),
        async (codec) => {
          clearCache()

          const result1 = await isCodecSupported(codec, 'audio')
          const result2 = await isCodecSupported(codec, 'audio')
          const result3 = await isCodecSupported(codec, 'audio')

          return result1 === result2 && result2 === result3
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Cache is populated after first call
   * After calling isCodecSupported, the cache should contain an entry for that codec.
   */
  it('populates cache after first codec check', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...DIRECT_PLAY_VIDEO_CODECS),
        async (codec) => {
          clearCache()
          const initialSize = getCacheSize()

          await isCodecSupported(codec, 'video')
          const afterFirstCall = getCacheSize()

          // Cache should have grown by 1
          return afterFirstCall === initialSize + 1
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Subsequent calls use cached values (cache size doesn't grow)
   * After the first call, subsequent calls should not add new cache entries.
   */
  it('uses cached values on subsequent calls', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...DIRECT_PLAY_VIDEO_CODECS),
        async (codec) => {
          clearCache()

          await isCodecSupported(codec, 'video')
          const sizeAfterFirst = getCacheSize()

          await isCodecSupported(codec, 'video')
          const sizeAfterSecond = getCacheSize()

          await isCodecSupported(codec, 'video')
          const sizeAfterThird = getCacheSize()

          // Cache size should remain constant after first call
          return (
            sizeAfterFirst === sizeAfterSecond &&
            sizeAfterSecond === sizeAfterThird
          )
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Case-insensitive codec matching uses same cache entry
   * Codecs with different casing should resolve to the same cache entry.
   */
  it('handles case-insensitive codec names with same cache entry', async () => {
    clearCache()

    // Test with h264 in different cases
    await isCodecSupported('h264', 'video')
    const sizeAfterLower = getCacheSize()

    await isCodecSupported('H264', 'video')
    const sizeAfterUpper = getCacheSize()

    await isCodecSupported('H264', 'video')
    const sizeAfterMixed = getCacheSize()

    // All should use the same cache entry
    expect(sizeAfterLower).toBe(1)
    expect(sizeAfterUpper).toBe(1)
    expect(sizeAfterMixed).toBe(1)
  })

  /**
   * Property: clearCache resets the cache
   * After clearing, the cache should be empty and subsequent calls should repopulate it.
   */
  it('clearCache resets the cache completely', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...DIRECT_PLAY_VIDEO_CODECS),
        async (codec) => {
          // Populate cache
          await isCodecSupported(codec, 'video')
          const sizeBeforeClear = getCacheSize()

          // Clear cache
          clearCache()
          const sizeAfterClear = getCacheSize()

          // Repopulate
          await isCodecSupported(codec, 'video')
          const sizeAfterRepopulate = getCacheSize()

          return (
            sizeBeforeClear > 0 &&
            sizeAfterClear === 0 &&
            sizeAfterRepopulate === 1
          )
        },
      ),
      { numRuns: 100 },
    )
  })
})
