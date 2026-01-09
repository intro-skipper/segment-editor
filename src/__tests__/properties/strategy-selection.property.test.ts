/**
 * Feature: direct-play-fallback, Property 3: Strategy Selection Correctness
 *
 * For any video item with known MediaSourceInfo:
 * - If compatible, the selected strategy SHALL be 'direct' with a direct play URL
 * - If incompatible, the selected strategy SHALL be 'hls' with an HLS URL
 * - The URL type SHALL match the selected strategy
 *
 * **Validates: Requirements 3.1, 3.2, 3.4**
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as fc from 'fast-check'
import type { BaseItemDto } from '@/types/jellyfin'
import { extractMediaSourceInfo, getPlaybackConfig } from '@/services/video/api'
import {
  DIRECT_PLAY_AUDIO_CODECS,
  DIRECT_PLAY_CONTAINERS,
  DIRECT_PLAY_VIDEO_CODECS,
  clearCache,
} from '@/services/video/compatibility'

// Mock the jellyfin service
vi.mock('@/services/jellyfin', () => ({
  getCredentials: () => ({
    serverAddress: 'https://jellyfin.example.com',
    accessToken: 'test-api-key-12345',
  }),
  getDeviceId: () => 'test-device-id-abc123',
  buildApiUrl: vi.fn(
    ({
      serverAddress,
      accessToken,
      endpoint,
      query,
    }: {
      serverAddress: string
      accessToken: string
      endpoint: string
      query?: URLSearchParams
    }) => {
      const params = new URLSearchParams(query)
      if (accessToken) {
        params.set('ApiKey', accessToken)
      }
      const queryString = params.toString()
      return `${serverAddress}/${endpoint}${queryString ? `?${queryString}` : ''}`
    },
  ),
}))

// Mock the compatibility checker to control test behavior
// In real browser, isCodecSupported would check actual browser capabilities
// For testing, we mock checkCompatibility to return predictable results
vi.mock('@/services/video/compatibility', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  type CompatModule = typeof import('@/services/video/compatibility')
  const original = await importOriginal<CompatModule>()
  return {
    ...original,
    checkCompatibility: vi.fn(
      (
        mediaSource:
          | { container: string; videoCodec: string; audioCodec: string }
          | null
          | undefined,
      ) => {
        if (!mediaSource) {
          return { canDirectPlay: false, reason: 'Media source unavailable' }
        }

        const { container, videoCodec, audioCodec } = mediaSource

        // Check container
        const containerSupported = (
          original.DIRECT_PLAY_CONTAINERS as ReadonlyArray<string>
        ).includes(container.toLowerCase())
        if (!containerSupported) {
          return {
            canDirectPlay: false,
            reason: `Unsupported container: ${container}`,
          }
        }

        // Check video codec
        const videoSupported = (
          original.DIRECT_PLAY_VIDEO_CODECS as ReadonlyArray<string>
        ).includes(videoCodec.toLowerCase())
        if (!videoSupported) {
          return {
            canDirectPlay: false,
            reason: `Unsupported video codec: ${videoCodec}`,
          }
        }

        // Check audio codec
        const audioSupported = (
          original.DIRECT_PLAY_AUDIO_CODECS as ReadonlyArray<string>
        ).includes(audioCodec.toLowerCase())
        if (!audioSupported) {
          return {
            canDirectPlay: false,
            reason: `Unsupported audio codec: ${audioCodec}`,
          }
        }

        return { canDirectPlay: true }
      },
    ),
  }
})

describe('Feature: direct-play-fallback, Property 3: Strategy Selection Correctness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearCache()
  })

  // Arbitrary for valid UUID
  const uuidArb = fc.uuid()

  // Arbitrary for incompatible container
  const incompatibleContainerArb = fc.constantFrom(
    'avi',
    'wmv',
    'flv',
    'mov',
    'ts',
    'unknown',
  )

  // Arbitrary for incompatible video codec
  const incompatibleVideoCodecArb = fc.constantFrom(
    'mpeg2',
    'mpeg4',
    'wmv3',
    'divx',
    'xvid',
    'unknown',
  )

  // Arbitrary for incompatible audio codec
  const incompatibleAudioCodecArb = fc.constantFrom(
    'dts',
    'truehd',
    'eac3',
    'wma',
    'unknown',
  )

  // Helper to create a BaseItemDto with media sources
  function createItemWithMediaSource(
    id: string,
    container: string,
    videoCodec: string,
    audioCodec: string,
    bitrate?: number,
  ): BaseItemDto {
    return {
      Id: id,
      Name: 'Test Video',
      MediaSources: [
        {
          Container: container,
          Bitrate: bitrate,
          MediaStreams: [
            { Type: 'Video', Codec: videoCodec },
            { Type: 'Audio', Codec: audioCodec },
          ],
        },
      ],
    } as BaseItemDto
  }

  /**
   * Property: Compatible items use direct play strategy
   * For any item with compatible container, video codec, and audio codec,
   * the strategy should be 'direct'
   */
  it('selects direct play strategy for compatible items', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        fc.constantFrom(...DIRECT_PLAY_CONTAINERS),
        fc.constantFrom(...DIRECT_PLAY_VIDEO_CODECS),
        fc.constantFrom(...DIRECT_PLAY_AUDIO_CODECS),
        async (itemId, container, videoCodec, audioCodec) => {
          clearCache()
          const item = createItemWithMediaSource(
            itemId,
            container,
            videoCodec,
            audioCodec,
          )

          const config = await getPlaybackConfig(item)

          expect(config.strategy).toBe('direct')
          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Direct play URL contains /stream endpoint
   * For compatible items, the URL should use the direct stream endpoint
   */
  it('generates direct play URL with /stream endpoint for compatible items', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        fc.constantFrom(...DIRECT_PLAY_CONTAINERS),
        fc.constantFrom(...DIRECT_PLAY_VIDEO_CODECS),
        fc.constantFrom(...DIRECT_PLAY_AUDIO_CODECS),
        async (itemId, container, videoCodec, audioCodec) => {
          clearCache()
          const item = createItemWithMediaSource(
            itemId,
            container,
            videoCodec,
            audioCodec,
          )

          const config = await getPlaybackConfig(item)

          expect(config.url).toContain(`Videos/${itemId}/stream`)
          expect(config.url).not.toContain('master.m3u8')
          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Incompatible container uses HLS strategy
   * For items with unsupported containers, the strategy should be 'hls'
   */
  it('selects HLS strategy for incompatible containers', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        incompatibleContainerArb,
        fc.constantFrom(...DIRECT_PLAY_VIDEO_CODECS),
        fc.constantFrom(...DIRECT_PLAY_AUDIO_CODECS),
        async (itemId, container, videoCodec, audioCodec) => {
          clearCache()
          const item = createItemWithMediaSource(
            itemId,
            container,
            videoCodec,
            audioCodec,
          )

          const config = await getPlaybackConfig(item)

          expect(config.strategy).toBe('hls')
          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Incompatible video codec uses HLS strategy
   * For items with unsupported video codecs, the strategy should be 'hls'
   */
  it('selects HLS strategy for incompatible video codecs', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        fc.constantFrom(...DIRECT_PLAY_CONTAINERS),
        incompatibleVideoCodecArb,
        fc.constantFrom(...DIRECT_PLAY_AUDIO_CODECS),
        async (itemId, container, videoCodec, audioCodec) => {
          clearCache()
          const item = createItemWithMediaSource(
            itemId,
            container,
            videoCodec,
            audioCodec,
          )

          const config = await getPlaybackConfig(item)

          expect(config.strategy).toBe('hls')
          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Incompatible audio codec uses HLS strategy
   * For items with unsupported audio codecs, the strategy should be 'hls'
   */
  it('selects HLS strategy for incompatible audio codecs', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        fc.constantFrom(...DIRECT_PLAY_CONTAINERS),
        fc.constantFrom(...DIRECT_PLAY_VIDEO_CODECS),
        incompatibleAudioCodecArb,
        async (itemId, container, videoCodec, audioCodec) => {
          clearCache()
          const item = createItemWithMediaSource(
            itemId,
            container,
            videoCodec,
            audioCodec,
          )

          const config = await getPlaybackConfig(item)

          expect(config.strategy).toBe('hls')
          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: HLS URL contains master.m3u8 endpoint
   * For incompatible items, the URL should use the HLS endpoint
   */
  it('generates HLS URL with master.m3u8 endpoint for incompatible items', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        incompatibleContainerArb,
        fc.constantFrom(...DIRECT_PLAY_VIDEO_CODECS),
        fc.constantFrom(...DIRECT_PLAY_AUDIO_CODECS),
        async (itemId, container, videoCodec, audioCodec) => {
          clearCache()
          const item = createItemWithMediaSource(
            itemId,
            container,
            videoCodec,
            audioCodec,
          )

          const config = await getPlaybackConfig(item)

          expect(config.url).toContain('master.m3u8')
          expect(config.url).not.toContain('/stream?')
          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Missing media source info uses HLS strategy
   * For items without media source info, the strategy should be 'hls'
   */
  it('selects HLS strategy when media source info is missing', async () => {
    await fc.assert(
      fc.asyncProperty(uuidArb, async (itemId) => {
        clearCache()
        const item: BaseItemDto = {
          Id: itemId,
          Name: 'Test Video',
          MediaSources: [],
        } as BaseItemDto

        const config = await getPlaybackConfig(item)

        expect(config.strategy).toBe('hls')
        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: URL type matches strategy
   * The URL format should always match the selected strategy
   */
  it('URL type matches the selected strategy', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        fc.constantFrom(...DIRECT_PLAY_CONTAINERS, 'avi', 'wmv'),
        fc.constantFrom(...DIRECT_PLAY_VIDEO_CODECS, 'mpeg2', 'wmv3'),
        fc.constantFrom(...DIRECT_PLAY_AUDIO_CODECS, 'dts', 'wma'),
        async (itemId, container, videoCodec, audioCodec) => {
          clearCache()
          const item = createItemWithMediaSource(
            itemId,
            container,
            videoCodec,
            audioCodec,
          )

          const config = await getPlaybackConfig(item)

          if (config.strategy === 'direct') {
            // Direct play URLs use /stream endpoint
            expect(config.url).toContain('/stream')
            expect(config.url).not.toContain('master.m3u8')
          } else {
            // HLS URLs use master.m3u8 endpoint
            expect(config.url).toContain('master.m3u8')
          }
          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: extractMediaSourceInfo returns correct structure
   * For any item with media sources, the extracted info should match
   */
  it('extractMediaSourceInfo returns correct structure', () => {
    fc.assert(
      fc.property(
        uuidArb,
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.option(fc.integer({ min: 1000, max: 100_000_000 }), {
          nil: undefined,
        }),
        (itemId, container, videoCodec, audioCodec, bitrate) => {
          const item = createItemWithMediaSource(
            itemId,
            container,
            videoCodec,
            audioCodec,
            bitrate ?? undefined,
          )

          const info = extractMediaSourceInfo(item)

          expect(info).not.toBeNull()
          expect(info?.container).toBe(container)
          expect(info?.videoCodec).toBe(videoCodec)
          expect(info?.audioCodec).toBe(audioCodec)
          if (bitrate !== undefined) {
            expect(info?.bitrate).toBe(bitrate)
          }
          return true
        },
      ),
      { numRuns: 100 },
    )
  })
})
