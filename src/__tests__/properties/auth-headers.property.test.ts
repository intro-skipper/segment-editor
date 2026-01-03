/**
 * Feature: codebase-audit-refactor, Property 9: Authentication Header Generation
 * For any non-null, non-empty token string, the authentication header generator
 * SHALL return an object containing an Authorization header with the format
 * `MediaBrowser Token="<token>"`. For any null or undefined token, it SHALL
 * return an empty object.
 */

import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { getAuthHeaders } from '@/lib/header-utils'

describe('Authentication Header Generation', () => {
  /**
   * Property: Non-empty tokens produce Authorization header
   * For any non-empty string token, getAuthHeaders SHALL return an object
   * with an Authorization header.
   */
  it('produces Authorization header for non-empty tokens', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (token) => {
        const result = getAuthHeaders(token)
        return 'Authorization' in result
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Authorization header has correct format
   * For any non-empty token, the Authorization header SHALL have the format
   * `MediaBrowser Token="<token>"`.
   */
  it('produces correctly formatted Authorization header', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (token) => {
        const result = getAuthHeaders(token)
        const expected = `MediaBrowser Token="${token}"`
        return result.Authorization === expected
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Token value is preserved exactly in header
   * For any token string, the token value SHALL appear exactly as provided
   * within the Authorization header.
   */
  it('preserves token value exactly in header', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (token) => {
        const result = getAuthHeaders(token)
        const auth = result['Authorization']
        return typeof auth === 'string' && auth.includes(`"${token}"`)
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Null token returns empty object
   * For null token, getAuthHeaders SHALL return an empty object.
   */
  it('returns empty object for null token', () => {
    const result = getAuthHeaders(null)
    expect(result).toEqual({})
    expect(Object.keys(result)).toHaveLength(0)
  })

  /**
   * Property: Undefined token returns empty object
   * For undefined token, getAuthHeaders SHALL return an empty object.
   */
  it('returns empty object for undefined token', () => {
    const result = getAuthHeaders(undefined)
    expect(result).toEqual({})
    expect(Object.keys(result)).toHaveLength(0)
  })

  /**
   * Property: Empty string token returns empty object
   * For empty string token, getAuthHeaders SHALL return an empty object.
   */
  it('returns empty object for empty string token', () => {
    const result = getAuthHeaders('')
    expect(result).toEqual({})
    expect(Object.keys(result)).toHaveLength(0)
  })

  /**
   * Property: Result is always a plain object
   * For any input, getAuthHeaders SHALL return a plain object (not null/undefined).
   */
  it('always returns a plain object', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)),
        (token) => {
          const result = getAuthHeaders(token)
          return typeof result === 'object' && !Array.isArray(result)
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Special characters in token are preserved
   * For tokens containing special characters, the characters SHALL be
   * preserved exactly in the Authorization header.
   */
  it('preserves special characters in token', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.length > 0),
        (token) => {
          const result = getAuthHeaders(token)
          // The token should appear exactly as provided between quotes
          const expectedFormat = `MediaBrowser Token="${token}"`
          return result.Authorization === expectedFormat
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Result object has at most one key
   * For any input, the result SHALL have either 0 keys (empty) or 1 key (Authorization).
   */
  it('result has at most one key', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)),
        (token) => {
          const result = getAuthHeaders(token)
          const keyCount = Object.keys(result).length
          return keyCount === 0 || keyCount === 1
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Whitespace-only tokens are treated as valid
   * For tokens containing only whitespace, they SHALL still produce
   * an Authorization header (whitespace is valid token content).
   */
  it('treats whitespace-only tokens as valid', () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.constantFrom(' ', '\t', '\n'), {
            minLength: 1,
            maxLength: 10,
          })
          .map((chars) => chars.join('')),
        (whitespaceToken) => {
          const result = getAuthHeaders(whitespaceToken)
          return (
            'Authorization' in result &&
            result.Authorization === `MediaBrowser Token="${whitespaceToken}"`
          )
        },
      ),
      { numRuns: 100 },
    )
  })
})
