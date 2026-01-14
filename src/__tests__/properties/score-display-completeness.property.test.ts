/**
 * Feature: Server Discovery, Property: Score Display Mapping Completeness
 *
 * For any valid `RecommendedServerInfoScore` enum value (GREAT, GOOD, OK, BAD),
 * the `getScoreDisplay` function SHALL return a non-empty label string and a
 * valid variant ('success' | 'warning' | 'error').
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { RecommendedServerInfoScore } from '@jellyfin/sdk/lib/models/recommended-server-info'
import { getScoreDisplay } from '@/services/jellyfin'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All valid score enum values.
 */
const ALL_SCORES = [
  RecommendedServerInfoScore.GREAT,
  RecommendedServerInfoScore.GOOD,
  RecommendedServerInfoScore.OK,
  RecommendedServerInfoScore.BAD,
] as const

/**
 * Valid variant values for score display.
 */
const VALID_VARIANTS = ['success', 'warning', 'error'] as const

// ─────────────────────────────────────────────────────────────────────────────
// Generators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generator for all valid RecommendedServerInfoScore enum values.
 */
const validScoreArb = fc.constantFrom(...ALL_SCORES)

// ─────────────────────────────────────────────────────────────────────────────
// Property Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Score Display Mapping Completeness', () => {
  /**
   * Property: Score Display Mapping Completeness
   *
   * For any valid RecommendedServerInfoScore enum value, getScoreDisplay
   * SHALL return a non-empty label string and a valid variant.
   */
  it('returns non-empty label for all valid scores', () => {
    fc.assert(
      fc.property(validScoreArb, (score) => {
        const display = getScoreDisplay(score)

        // Label should be a non-empty string
        expect(typeof display.label).toBe('string')
        expect(display.label.length).toBeGreaterThan(0)
        expect(display.label.trim().length).toBeGreaterThan(0)

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Returns valid variant for all valid scores.
   */
  it('returns valid variant for all valid scores', () => {
    fc.assert(
      fc.property(validScoreArb, (score) => {
        const display = getScoreDisplay(score)

        // Variant should be one of the valid values
        expect(VALID_VARIANTS).toContain(display.variant)

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: All enum values are covered (exhaustive mapping).
   */
  it('covers all enum values exhaustively', () => {
    // Test each score value explicitly
    for (const score of ALL_SCORES) {
      const display = getScoreDisplay(score)

      expect(display.label).toBeTruthy()
      expect(VALID_VARIANTS).toContain(display.variant)
    }
  })

  /**
   * Property: GREAT and GOOD scores return 'success' variant.
   */
  it('returns success variant for GREAT and GOOD scores', () => {
    const greatDisplay = getScoreDisplay(RecommendedServerInfoScore.GREAT)
    const goodDisplay = getScoreDisplay(RecommendedServerInfoScore.GOOD)

    expect(greatDisplay.variant).toBe('success')
    expect(goodDisplay.variant).toBe('success')
  })

  /**
   * Property: OK score returns 'warning' variant.
   */
  it('returns warning variant for OK score', () => {
    const okDisplay = getScoreDisplay(RecommendedServerInfoScore.OK)

    expect(okDisplay.variant).toBe('warning')
  })

  /**
   * Property: BAD score returns 'error' variant.
   */
  it('returns error variant for BAD score', () => {
    const badDisplay = getScoreDisplay(RecommendedServerInfoScore.BAD)

    expect(badDisplay.variant).toBe('error')
  })

  /**
   * Property: Same score always returns same display (deterministic).
   */
  it('is deterministic - same score returns same display', () => {
    fc.assert(
      fc.property(validScoreArb, (score) => {
        const display1 = getScoreDisplay(score)
        const display2 = getScoreDisplay(score)

        expect(display1.label).toBe(display2.label)
        expect(display1.variant).toBe(display2.variant)

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Different scores have different labels (uniqueness).
   */
  it('returns unique labels for different scores', () => {
    const labels = ALL_SCORES.map((score) => getScoreDisplay(score).label)
    const uniqueLabels = new Set(labels)

    // All labels should be unique
    expect(uniqueLabels.size).toBe(ALL_SCORES.length)
  })

  /**
   * Property: Labels are human-readable (not technical enum names).
   */
  it('returns human-readable labels', () => {
    for (const score of ALL_SCORES) {
      const display = getScoreDisplay(score)

      // Labels should not be the raw enum names
      expect(display.label).not.toBe('GREAT')
      expect(display.label).not.toBe('GOOD')
      expect(display.label).not.toBe('OK')
      expect(display.label).not.toBe('BAD')

      // Labels should not be numbers
      expect(isNaN(Number(display.label))).toBe(true)
    }
  })

  /**
   * Property: Handles edge case of numeric score values.
   * The enum values are: GREAT=2, GOOD=1, OK=0, BAD=-1
   */
  it('handles numeric enum values correctly', () => {
    // Test with numeric values directly
    const greatDisplay = getScoreDisplay(2 as RecommendedServerInfoScore)
    const goodDisplay = getScoreDisplay(1 as RecommendedServerInfoScore)
    const okDisplay = getScoreDisplay(0 as RecommendedServerInfoScore)
    const badDisplay = getScoreDisplay(-1 as RecommendedServerInfoScore)

    expect(greatDisplay.label).toBeTruthy()
    expect(goodDisplay.label).toBeTruthy()
    expect(okDisplay.label).toBeTruthy()
    expect(badDisplay.label).toBeTruthy()

    expect(VALID_VARIANTS).toContain(greatDisplay.variant)
    expect(VALID_VARIANTS).toContain(goodDisplay.variant)
    expect(VALID_VARIANTS).toContain(okDisplay.variant)
    expect(VALID_VARIANTS).toContain(badDisplay.variant)
  })
})
