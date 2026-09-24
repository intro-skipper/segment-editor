/**
 * Feature: direct-play-fallback, Property 6: Capability Caching Idempotence
 *
 * For any codec string, calling isCodecSupported multiple times with the same codec
 * SHALL return the same result, and subsequent calls SHALL use cached values
 * (not re-query the browser APIs).
 */

import { beforeEach, describe, it } from 'vitest'
import * as fc from 'fast-check'
import {
  DIRECT_PLAY_AUDIO_CODECS,
  DIRECT_PLAY_VIDEO_CODECS,
  clearCache,
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

          const [result1, result2, result3] = await Promise.all([
            isCodecSupported(codec, 'video'),
            isCodecSupported(codec, 'video'),
            isCodecSupported(codec, 'video'),
          ])

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

          const [result1, result2, result3] = await Promise.all([
            isCodecSupported(codec, 'audio'),
            isCodecSupported(codec, 'audio'),
            isCodecSupported(codec, 'audio'),
          ])

          return result1 === result2 && result2 === result3
        },
      ),
      { numRuns: 100 },
    )
  })
})
