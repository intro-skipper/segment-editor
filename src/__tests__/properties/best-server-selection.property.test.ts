/**
 * Feature: Server Discovery, Property: Best Server Selection
 *
 * For any non-empty list of discovered servers, `findBestServer` SHALL return
 * the server with the highest score. For servers with equal scores, it SHALL
 * prefer HTTPS addresses over HTTP addresses.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { RecommendedServerInfoScore } from '@jellyfin/sdk/lib/models/recommended-server-info'
import type { RecommendedServerInfo } from '@jellyfin/sdk/lib/models/recommended-server-info'
import { findBestServer } from '@/services/jellyfin'

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
 * Generator for non-empty arrays of RecommendedServerInfo.
 */
const nonEmptyServerListArb = fc.array(serverInfoArb, {
  minLength: 1,
  maxLength: 20,
})

// ─────────────────────────────────────────────────────────────────────────────
// Property Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Best Server Selection', () => {
  /**
   * Property: Best Server Selection
   *
   * For any non-empty list of discovered servers, findBestServer SHALL return
   * the server with the highest score.
   */
  it('returns server with highest score', () => {
    fc.assert(
      fc.property(nonEmptyServerListArb, (servers) => {
        const best = findBestServer(servers)

        // Should never return null for non-empty list
        expect(best).not.toBeNull()

        // Find the maximum score in the list
        const maxScore = Math.max(...servers.map((s) => s.score))

        // Best server should have the maximum score
        expect(best!.score).toBe(maxScore)

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: For servers with equal highest scores, HTTPS is preferred.
   */
  it('prefers HTTPS over HTTP for equal highest scores', () => {
    fc.assert(
      fc.property(nonEmptyServerListArb, (servers) => {
        const best = findBestServer(servers)
        expect(best).not.toBeNull()

        // Find all servers with the same (highest) score
        const maxScore = best!.score
        const serversWithMaxScore = servers.filter((s) => s.score === maxScore)

        // Check if there's an HTTPS server with max score
        const hasHttpsWithMaxScore = serversWithMaxScore.some((s) =>
          s.address.toLowerCase().startsWith('https://'),
        )

        // If there's an HTTPS server with max score, best should be HTTPS
        if (hasHttpsWithMaxScore) {
          expect(best!.address.toLowerCase().startsWith('https://')).toBe(true)
        }

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Returns null for empty list.
   */
  it('returns null for empty server list', () => {
    const result = findBestServer([])
    expect(result).toBeNull()
  })

  /**
   * Property: Returns the only server for single-element list.
   */
  it('returns the only server for single-element list', () => {
    fc.assert(
      fc.property(serverInfoArb, (server) => {
        const result = findBestServer([server])

        expect(result).not.toBeNull()
        expect(result!.address).toBe(server.address)
        expect(result!.score).toBe(server.score)

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Best server is always one of the input servers.
   */
  it('returns a server from the input list', () => {
    fc.assert(
      fc.property(nonEmptyServerListArb, (servers) => {
        const best = findBestServer(servers)

        expect(best).not.toBeNull()

        // Best server should be one of the input servers
        const found = servers.some(
          (s) => s.address === best!.address && s.score === best!.score,
        )
        expect(found).toBe(true)

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Idempotent - calling findBestServer on result gives same result.
   */
  it('is idempotent when applied to its own result', () => {
    fc.assert(
      fc.property(nonEmptyServerListArb, (servers) => {
        const best = findBestServer(servers)
        expect(best).not.toBeNull()

        // Finding best of [best] should return best
        const bestOfBest = findBestServer([best!])
        expect(bestOfBest).not.toBeNull()
        expect(bestOfBest!.address).toBe(best!.address)
        expect(bestOfBest!.score).toBe(best!.score)

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: GREAT score always beats lower scores.
   */
  it('GREAT score server is selected over lower scores', () => {
    fc.assert(
      fc.property(
        fc.array(serverInfoArb, { minLength: 1, maxLength: 10 }),
        serverInfoArb,
        (otherServers, greatServer) => {
          // Force the great server to have GREAT score
          const serverWithGreatScore: RecommendedServerInfo = {
            ...greatServer,
            score: RecommendedServerInfoScore.GREAT,
          }

          // Force other servers to have lower scores
          const lowerScoreServers = otherServers.map((s) => ({
            ...s,
            score: fc.sample(
              fc.constantFrom(
                RecommendedServerInfoScore.GOOD,
                RecommendedServerInfoScore.OK,
                RecommendedServerInfoScore.BAD,
              ),
              1,
            )[0],
          }))

          const allServers = [...lowerScoreServers, serverWithGreatScore]
          const best = findBestServer(allServers)

          expect(best).not.toBeNull()
          expect(best!.score).toBe(RecommendedServerInfoScore.GREAT)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Does not mutate input array.
   */
  it('does not mutate the input array', () => {
    fc.assert(
      fc.property(nonEmptyServerListArb, (servers) => {
        // Create a copy of addresses for comparison
        const originalAddresses = servers.map((s) => s.address)

        findBestServer(servers)

        // Original array should be unchanged
        expect(servers.map((s) => s.address)).toEqual(originalAddresses)

        return true
      }),
      { numRuns: 100 },
    )
  })
})
