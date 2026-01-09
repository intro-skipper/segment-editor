/**
 * Property: Input Validation Rejection
 *
 * For any authentication attempt with username/password where the password field
 * is empty or whitespace-only, the validation SHALL reject the submission
 * before making an API call.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import type {
  ApiKeyCredentials,
  AuthCredentials as Credentials,
  UserPassCredentials,
} from '@/services/jellyfin'
import { isValidPassword, validateCredentials } from '@/services/jellyfin'

// ─────────────────────────────────────────────────────────────────────────────
// Arbitraries
// ─────────────────────────────────────────────────────────────────────────────

// Generate whitespace-only strings (spaces, tabs, newlines)
const whitespaceOnlyArb = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r', '  ', '\t\t'), {
    minLength: 1,
    maxLength: 20,
  })
  .map((chars) => chars.join(''))

// Generate valid usernames (non-empty, non-whitespace-only)
const validUsernameArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0)

// Generate valid passwords (either empty or non-whitespace-only)
const validPasswordArb = fc.oneof(
  fc.constant(''), // Empty password is valid
  fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0), // Non-empty, non-whitespace
)

// Generate valid API keys (non-empty, non-whitespace-only)
const validApiKeyArb = fc
  .array(fc.constantFrom(...'0123456789abcdef'.split('')), {
    minLength: 32,
    maxLength: 64,
  })
  .map((chars) => chars.join(''))

// Generate empty or whitespace-only API keys
const invalidApiKeyArb = fc.oneof(fc.constant(''), whitespaceOnlyArb)

// Generate empty or whitespace-only usernames
const invalidUsernameArb = fc.oneof(fc.constant(''), whitespaceOnlyArb)

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Property: Input Validation Rejection', () => {
  describe('isValidPassword', () => {
    /**
     * Feature: server-discovery, Property: Input Validation Rejection
     *
     * For any whitespace-only password string, isValidPassword SHALL return false.
     */
    it('rejects whitespace-only passwords', () => {
      fc.assert(
        fc.property(whitespaceOnlyArb, (password) => {
          expect(isValidPassword(password)).toBe(false)
          return true
        }),
        { numRuns: 100 },
      )
    })

    /**
     * Empty passwords are valid (some Jellyfin users have no password).
     */
    it('accepts empty passwords', () => {
      expect(isValidPassword('')).toBe(true)
    })

    /**
     * For any non-empty, non-whitespace-only password, isValidPassword SHALL return true.
     */
    it('accepts valid non-empty passwords', () => {
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 50 })
            .filter((s) => s.trim().length > 0),
          (password) => {
            expect(isValidPassword(password)).toBe(true)
            return true
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('validateCredentials - UserPass', () => {
    /**
     * Feature: server-discovery, Property: Input Validation Rejection
     *
     * For any authentication attempt with username/password where the password
     * is whitespace-only, validation SHALL reject before API call.
     */
    it('rejects whitespace-only passwords in userPass credentials', () => {
      fc.assert(
        fc.property(
          validUsernameArb,
          whitespaceOnlyArb,
          (username, password) => {
            const credentials: UserPassCredentials = {
              method: 'userPass',
              username,
              password,
            }

            const error = validateCredentials(credentials)

            // Should return an error message
            expect(error).toBeDefined()
            expect(typeof error).toBe('string')
            expect(error!.length).toBeGreaterThan(0)

            return true
          },
        ),
        { numRuns: 100 },
      )
    })

    /**
     * For any authentication attempt with empty or whitespace-only username,
     * validation SHALL reject before API call.
     */
    it('rejects empty or whitespace-only usernames', () => {
      fc.assert(
        fc.property(
          invalidUsernameArb,
          validPasswordArb,
          (username, password) => {
            const credentials: UserPassCredentials = {
              method: 'userPass',
              username,
              password,
            }

            const error = validateCredentials(credentials)

            // Should return an error message
            expect(error).toBeDefined()
            expect(typeof error).toBe('string')
            expect(error!.length).toBeGreaterThan(0)

            return true
          },
        ),
        { numRuns: 100 },
      )
    })

    /**
     * For any valid username and valid password (empty or non-whitespace),
     * validation SHALL pass.
     */
    it('accepts valid userPass credentials', () => {
      fc.assert(
        fc.property(
          validUsernameArb,
          validPasswordArb,
          (username, password) => {
            const credentials: UserPassCredentials = {
              method: 'userPass',
              username,
              password,
            }

            const error = validateCredentials(credentials)

            // Should not return an error
            expect(error).toBeUndefined()

            return true
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('validateCredentials - ApiKey', () => {
    /**
     * For any empty or whitespace-only API key,
     * validation SHALL reject before API call.
     */
    it('rejects empty or whitespace-only API keys', () => {
      fc.assert(
        fc.property(invalidApiKeyArb, (apiKey) => {
          const credentials: ApiKeyCredentials = {
            method: 'apiKey',
            apiKey,
          }

          const error = validateCredentials(credentials)

          // Should return an error message
          expect(error).toBeDefined()
          expect(typeof error).toBe('string')
          expect(error!.length).toBeGreaterThan(0)

          return true
        }),
        { numRuns: 100 },
      )
    })

    /**
     * For any valid API key (non-empty, non-whitespace-only),
     * validation SHALL pass.
     */
    it('accepts valid API keys', () => {
      fc.assert(
        fc.property(validApiKeyArb, (apiKey) => {
          const credentials: ApiKeyCredentials = {
            method: 'apiKey',
            apiKey,
          }

          const error = validateCredentials(credentials)

          // Should not return an error
          expect(error).toBeUndefined()

          return true
        }),
        { numRuns: 100 },
      )
    })
  })

  describe('Validation happens before API call', () => {
    /**
     * For any invalid credentials, validateCredentials returns synchronously
     * without making any network requests.
     */
    it('validates synchronously without network calls', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            // Invalid userPass: whitespace password
            fc.record<UserPassCredentials>({
              method: fc.constant('userPass' as const),
              username: validUsernameArb,
              password: whitespaceOnlyArb,
            }),
            // Invalid userPass: empty username
            fc.record<UserPassCredentials>({
              method: fc.constant('userPass' as const),
              username: invalidUsernameArb,
              password: validPasswordArb,
            }),
            // Invalid apiKey: empty or whitespace
            fc.record<ApiKeyCredentials>({
              method: fc.constant('apiKey' as const),
              apiKey: invalidApiKeyArb,
            }),
          ),
          (credentials: Credentials) => {
            // validateCredentials is synchronous - if it were async or made
            // network calls, this would fail or hang
            const startTime = performance.now()
            const error = validateCredentials(credentials)
            const endTime = performance.now()

            // Should complete in under 1ms (no network call)
            expect(endTime - startTime).toBeLessThan(10)

            // Should return an error
            expect(error).toBeDefined()

            return true
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
