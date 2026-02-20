/**
 * Feature: direct-play-fallback, Property 2: Direct Play URL Correctness
 *
 * For any compatible video item, the generated direct play URL SHALL:
 * - Use the static stream endpoint format (`/Videos/{itemId}/stream`)
 * - Include DeviceId and authentication token
 * - Include StartTimeTicks when provided
 * - Be a valid URL that can be parsed
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as fc from 'fast-check'
import { getDirectPlayUrl } from '@/services/video/api'

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

describe('Feature: direct-play-fallback, Property 2: Direct Play URL Correctness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Arbitrary for valid UUID-like item IDs
  const itemIdArb = fc.uuid()

  // Arbitrary for optional start time ticks (positive integers or undefined)
  const startTimeTicksArb = fc.option(
    fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
    { nil: undefined },
  )

  // Arbitrary for optional container
  const containerArb = fc.option(fc.constantFrom('mp4', 'mkv', 'webm'), {
    nil: undefined,
  })

  // Arbitrary for hex string (32 chars for media source ID)
  const hexStringArb = fc
    .array(fc.constantFrom(...'0123456789abcdef'.split('')), {
      minLength: 32,
      maxLength: 32,
    })
    .map((chars) => chars.join(''))

  // Arbitrary for DirectPlayOptions
  const directPlayOptionsArb = fc
    .record({
      itemId: itemIdArb,
      mediaSourceId: fc.option(hexStringArb, { nil: undefined }),
      startTimeTicks: startTimeTicksArb,
      container: containerArb,
    })
    .map((opts) => ({
      itemId: opts.itemId,
      mediaSourceId: opts.mediaSourceId ?? undefined,
      startTimeTicks: opts.startTimeTicks ?? undefined,
      container: opts.container ?? undefined,
    }))

  /**
   * Property: URL uses static stream endpoint format
   * For any item ID, the URL should contain `/Videos/{itemId}/stream`
   */
  it('uses static stream endpoint format /Videos/{itemId}/stream', () => {
    fc.assert(
      fc.property(directPlayOptionsArb, (options) => {
        const url = getDirectPlayUrl(options)

        // URL should contain the correct endpoint pattern
        expect(url).toContain(`Videos/${options.itemId}/stream`)
        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: URL includes DeviceId parameter
   * For any options, the URL should include the DeviceId query parameter
   */
  it('includes DeviceId parameter', () => {
    fc.assert(
      fc.property(directPlayOptionsArb, (options) => {
        const url = getDirectPlayUrl(options)

        // URL should contain DeviceId parameter
        expect(url).toContain('DeviceId=test-device-id-abc123')
        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: URL includes authentication token
   * For any options, the URL should include the ApiKey query parameter
   */
  it('includes authentication token (ApiKey)', () => {
    fc.assert(
      fc.property(directPlayOptionsArb, (options) => {
        const url = getDirectPlayUrl(options)

        // URL should contain ApiKey parameter
        expect(url).toContain('ApiKey=test-api-key-12345')
        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: URL includes StartTimeTicks when provided
   * When startTimeTicks is provided and > 0, it should be in the URL
   */
  it('includes StartTimeTicks when provided and greater than 0', () => {
    fc.assert(
      fc.property(
        itemIdArb,
        fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
        (itemId, startTimeTicks) => {
          const url = getDirectPlayUrl({ itemId, startTimeTicks })

          // URL should contain StartTimeTicks parameter
          expect(url).toContain(`StartTimeTicks=${startTimeTicks}`)
          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: URL does not include StartTimeTicks when zero or undefined
   * When startTimeTicks is 0 or undefined, it should not be in the URL
   */
  it('does not include StartTimeTicks when zero or undefined', () => {
    fc.assert(
      fc.property(
        itemIdArb,
        fc.constantFrom(undefined, 0),
        (itemId, startTimeTicks) => {
          const url = getDirectPlayUrl({ itemId, startTimeTicks })

          // URL should not contain StartTimeTicks parameter
          expect(url).not.toContain('StartTimeTicks=')
          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: URL includes container when provided
   * When container is provided, it should be in the URL
   */
  it('includes Container when provided', () => {
    fc.assert(
      fc.property(
        itemIdArb,
        fc.constantFrom('mp4', 'mkv', 'webm'),
        (itemId, container) => {
          const url = getDirectPlayUrl({ itemId, container })

          // URL should contain Container parameter
          expect(url).toContain(`Container=${container}`)
          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: URL is parseable
   * For any options, the generated URL should be a valid URL
   */
  it('generates a valid parseable URL', () => {
    fc.assert(
      fc.property(directPlayOptionsArb, (options) => {
        const url = getDirectPlayUrl(options)

        // URL should be parseable without throwing
        expect(() => new URL(url)).not.toThrow()
        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: URL includes Static=true parameter
   * For any options, the URL should include Static=true for direct play
   */
  it('includes Static=true parameter for direct play', () => {
    fc.assert(
      fc.property(directPlayOptionsArb, (options) => {
        const url = getDirectPlayUrl(options)

        // URL should contain Static=true parameter
        expect(url).toContain('Static=true')
        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: URL includes MediaSourceId parameter
   * For any options, the URL should include MediaSourceId
   */
  it('includes MediaSourceId parameter', () => {
    fc.assert(
      fc.property(directPlayOptionsArb, (options) => {
        const url = getDirectPlayUrl(options)

        // URL should contain MediaSourceId parameter
        expect(url).toContain('MediaSourceId=')
        return true
      }),
      { numRuns: 100 },
    )
  })
})
