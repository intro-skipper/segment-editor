/**
 * Feature: Server Discovery, Property: Discovery Results Sorting
 *
 * For any list of discovered servers with varying scores, the `sortServersByScore`
 * function SHALL return servers sorted by score in descending order (highest score first).
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { RecommendedServerInfoScore } from '@jellyfin/sdk/lib/models/recommended-server-info'
import type { RecommendedServerInfo } from '@jellyfin/sdk/lib/models/recommended-server-info'
import { sortServersByScore } from '@/services/jellyfin'

// ─────────────────────────────────────────────────────────────────────────────
// Generators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generator for RecommendedServerInfoScore enum values.
 */
const scoreArb = fc.constantFrom(
  RecommendedServerInfoScore.GREAT,
  RecommendedServerInfoScore.GOOD,
  RecommendedServerInfoScore.OK,
  RecommendedServerInfoScore.BAD,
)

/**
 * Generator for server protocol (http or https).
 */
const protocolArb = fc.constantFrom('http', 'https')

/**
 * Generator for valid server addresses.
 */
const serverAddressArb = fc
  .tuple(protocolArb, fc.domain(), fc.nat({ max: 65535 }))
  .map(([protocol, domain, port]) => `${protocol}://${domain}:${port}`)

/**
 * Generator for RecommendedServerInfo objects.
 */
const serverInfoArb: fc.Arbitrary<RecommendedServerInfo> = fc.record({
  address: serverAddressArb,
  responseTime: fc.nat({ max: 10000 }),
  score: scoreArb,
  issues: fc.constant([]),
  systemInfo: fc.constant(undefined),
})

/**
 * Generator for arrays of RecommendedServerInfo.
 */
const serverListArb = fc.array(serverInfoArb, { minLength: 0, maxLength: 20 })

// ─────────────────────────────────────────────────────────────────────────────
// Property Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Discovery Results Sorting', () => {
  /**
   * Property: Discovery Results Sorting
   *
   * For any list of discovered servers with varying scores, the sorted result
   * SHALL have servers in descending order by score (highest score first).
   */
  it('sorts servers by score in descending order', () => {
    fc.assert(
      fc.property(serverListArb, (servers) => {
        const sorted = sortServersByScore(servers)

        // Verify descending order by score
        for (let i = 0; i < sorted.length - 1; i++) {
          const current = sorted[i]
          const next = sorted[i + 1]

          // Current score should be >= next score (descending order)
          expect(current.score).toBeGreaterThanOrEqual(next.score)
        }

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Sorting preserves all elements (no elements lost or duplicated).
   */
  it('preserves all elements after sorting', () => {
    fc.assert(
      fc.property(serverListArb, (servers) => {
        const sorted = sortServersByScore(servers)

        // Same length
        expect(sorted.length).toBe(servers.length)

        // All original elements are present
        for (const server of servers) {
          const found = sorted.some(
            (s) =>
              s.address === server.address &&
              s.score === server.score &&
              s.responseTime === server.responseTime,
          )
          expect(found).toBe(true)
        }

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: For servers with equal scores, HTTPS addresses come before HTTP.
   */
  it('prefers HTTPS over HTTP for equal scores', () => {
    fc.assert(
      fc.property(serverListArb, (servers) => {
        const sorted = sortServersByScore(servers)

        // Check that within same-score groups, HTTPS comes before HTTP
        for (let i = 0; i < sorted.length - 1; i++) {
          const current = sorted[i]
          const next = sorted[i + 1]

          // Only check when scores are equal
          if (current.score === next.score) {
            const currentIsHttps = current.address
              .toLowerCase()
              .startsWith('https://')
            const nextIsHttps = next.address
              .toLowerCase()
              .startsWith('https://')

            // If current is HTTP and next is HTTPS with same score, that's wrong
            // HTTPS should always come before HTTP for equal scores
            expect(!currentIsHttps && nextIsHttps).toBe(false)
          }
        }

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Sorting is idempotent (sorting twice gives same result).
   */
  it('is idempotent - sorting twice gives same result', () => {
    fc.assert(
      fc.property(serverListArb, (servers) => {
        const sortedOnce = sortServersByScore(servers)
        const sortedTwice = sortServersByScore(sortedOnce)

        // Results should be identical
        expect(sortedTwice.length).toBe(sortedOnce.length)
        for (let i = 0; i < sortedOnce.length; i++) {
          expect(sortedTwice[i].address).toBe(sortedOnce[i].address)
          expect(sortedTwice[i].score).toBe(sortedOnce[i].score)
        }

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Empty array returns empty array.
   */
  it('returns empty array for empty input', () => {
    const result = sortServersByScore([])
    expect(result).toEqual([])
  })

  /**
   * Property: Single element array returns same element.
   */
  it('returns same element for single-element array', () => {
    fc.assert(
      fc.property(serverInfoArb, (server) => {
        const result = sortServersByScore([server])
        expect(result.length).toBe(1)
        expect(result[0].address).toBe(server.address)
        expect(result[0].score).toBe(server.score)
        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Original array is not mutated.
   */
  it('does not mutate the original array', () => {
    fc.assert(
      fc.property(serverListArb, (servers) => {
        // Create a deep copy of addresses and scores for comparison
        const originalAddresses = servers.map((s) => s.address)
        const originalScores = servers.map((s) => s.score)

        sortServersByScore(servers)

        // Original array should be unchanged
        expect(servers.map((s) => s.address)).toEqual(originalAddresses)
        expect(servers.map((s) => s.score)).toEqual(originalScores)

        return true
      }),
      { numRuns: 100 },
    )
  })
})
