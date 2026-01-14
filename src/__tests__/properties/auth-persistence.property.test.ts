/**
 * Property: Authentication Persistence Round-Trip
 *
 * For any successful authentication result containing an access token,
 * storing the credentials via the API store and then reading them back
 * SHALL return the same access token value.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import type { AuthMethod } from '@/stores/api-store'
import type { AuthResult } from '@/services/jellyfin'
import { useApiStore } from '@/stores/api-store'
import { storeAuthResult } from '@/services/jellyfin'

// Storage key constant matching the store
const API_STORAGE_KEY = 'segment-editor-api'

// ─────────────────────────────────────────────────────────────────────────────
// Arbitraries
// ─────────────────────────────────────────────────────────────────────────────

// Generate valid access tokens (non-empty hex-like strings)
const accessTokenArb = fc
  .array(fc.constantFrom(...'0123456789abcdef'.split('')), {
    minLength: 32,
    maxLength: 64,
  })
  .map((chars) => chars.join(''))

// Generate valid server addresses
const serverAddressArb = fc.webUrl()

// Generate valid user IDs (UUID-like)
const userIdArb = fc.uuid()

// Generate valid usernames (non-empty, trimmed)
const usernameArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0)
  .map((s) => s.trim())

// Generate server versions (semver-like)
const serverVersionArb = fc
  .tuple(
    fc.integer({ min: 1, max: 20 }),
    fc.integer({ min: 0, max: 99 }),
    fc.integer({ min: 0, max: 99 }),
  )
  .map(([major, minor, patch]) => `${major}.${minor}.${patch}`)

// Generate auth methods
const authMethodArb = fc.constantFrom<AuthMethod>('apiKey', 'userPass')

// Generate successful auth results
const successfulAuthResultArb = fc.record<AuthResult>({
  success: fc.constant(true),
  accessToken: accessTokenArb,
  userId: fc.option(userIdArb, { nil: undefined }),
  username: fc.option(usernameArb, { nil: undefined }),
  serverVersion: fc.option(serverVersionArb, { nil: undefined }),
  error: fc.constant(undefined),
})

// Generate auth results with user info (for userPass auth)
const authResultWithUserInfoArb = fc.record<AuthResult>({
  success: fc.constant(true),
  accessToken: accessTokenArb,
  userId: userIdArb,
  username: usernameArb,
  serverVersion: fc.option(serverVersionArb, { nil: undefined }),
  error: fc.constant(undefined),
})

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Property: Authentication Persistence Round-Trip', () => {
  let originalStorage: string | null

  beforeEach(() => {
    // Save original localStorage state
    originalStorage = localStorage.getItem(API_STORAGE_KEY)
    // Reset store to initial state
    useApiStore.getState().clearAuth()
    useApiStore.getState().setServerAddress('')
  })

  afterEach(() => {
    // Restore original localStorage state
    if (originalStorage !== null) {
      localStorage.setItem(API_STORAGE_KEY, originalStorage)
    } else {
      localStorage.removeItem(API_STORAGE_KEY)
    }
    // Reset store
    useApiStore.getState().clearAuth()
    useApiStore.getState().setServerAddress('')
  })

  /**
   * Feature: server-discovery, Property: Authentication Persistence Round-Trip
   *
   * For any successful authentication result containing an access token,
   * storing the credentials via the API store and then reading them back
   * SHALL return the same access token value.
   */
  it('round-trips access token through store and localStorage', () => {
    fc.assert(
      fc.property(
        serverAddressArb,
        successfulAuthResultArb,
        authMethodArb,
        (serverAddress, authResult, authMethod) => {
          // Pre-condition: must have a valid access token
          if (!authResult.accessToken) return true

          // Store the auth result
          storeAuthResult(serverAddress, authResult, authMethod)

          // Read back from store
          const state = useApiStore.getState()

          // Verify access token matches exactly
          expect(state.apiKey).toBe(authResult.accessToken)

          // Verify server address is stored (trimmed)
          expect(state.serverAddress).toBe(serverAddress.trim())

          // Verify auth method is stored
          expect(state.authMethod).toBe(authMethod)

          // Verify connection status is set
          expect(state.validConnection).toBe(true)
          expect(state.validAuth).toBe(true)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * For any successful authentication with user info,
   * storing and reading back SHALL preserve userId and username.
   */
  it('round-trips user info through store', () => {
    fc.assert(
      fc.property(
        serverAddressArb,
        authResultWithUserInfoArb,
        (serverAddress, authResult) => {
          // Store the auth result with userPass method
          storeAuthResult(serverAddress, authResult, 'userPass')

          // Read back from store
          const state = useApiStore.getState()

          // Verify user info matches exactly
          expect(state.userId).toBe(authResult.userId)
          expect(state.username).toBe(authResult.username)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * For any successful authentication with server version,
   * storing and reading back SHALL preserve the server version.
   */
  it('round-trips server version through store', () => {
    fc.assert(
      fc.property(
        serverAddressArb,
        fc.record<AuthResult>({
          success: fc.constant(true),
          accessToken: accessTokenArb,
          serverVersion: serverVersionArb,
          userId: fc.constant(undefined),
          username: fc.constant(undefined),
          error: fc.constant(undefined),
        }),
        authMethodArb,
        (serverAddress, authResult, authMethod) => {
          // Store the auth result
          storeAuthResult(serverAddress, authResult, authMethod)

          // Read back from store
          const state = useApiStore.getState()

          // Verify server version matches exactly
          expect(state.serverVersion).toBe(authResult.serverVersion)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * For any failed authentication result (success: false),
   * storeAuthResult SHALL NOT modify the store.
   */
  it('does not store failed authentication results', () => {
    fc.assert(
      fc.property(
        serverAddressArb,
        fc.record<AuthResult>({
          success: fc.constant(false),
          accessToken: fc.option(accessTokenArb, { nil: undefined }),
          error: fc.string({ minLength: 1 }),
          userId: fc.constant(undefined),
          username: fc.constant(undefined),
          serverVersion: fc.constant(undefined),
        }),
        authMethodArb,
        (serverAddress, authResult, authMethod) => {
          // Get initial state
          const initialState = useApiStore.getState()
          const initialApiKey = initialState.apiKey
          const initialServerAddress = initialState.serverAddress

          // Attempt to store failed auth result
          storeAuthResult(serverAddress, authResult, authMethod)

          // Read back from store
          const state = useApiStore.getState()

          // Verify store was not modified
          expect(state.apiKey).toBe(initialApiKey)
          expect(state.serverAddress).toBe(initialServerAddress)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * For any successful authentication, the persisted state in localStorage
   * SHALL contain the access token for restoration on app reload.
   */
  it('persists access token to localStorage for app reload', () => {
    fc.assert(
      fc.property(
        serverAddressArb,
        successfulAuthResultArb,
        authMethodArb,
        (serverAddress, authResult, authMethod) => {
          // Pre-condition: must have a valid access token
          if (!authResult.accessToken) return true

          // Store the auth result
          storeAuthResult(serverAddress, authResult, authMethod)

          // Read from localStorage directly
          const stored = localStorage.getItem(API_STORAGE_KEY)
          expect(stored).not.toBeNull()

          const parsed = JSON.parse(stored!)
          const persistedState = parsed.state

          // Verify access token is persisted
          expect(persistedState.apiKey).toBe(authResult.accessToken)

          // Verify server address is persisted
          expect(persistedState.serverAddress).toBe(serverAddress.trim())

          // Verify auth method is persisted
          expect(persistedState.authMethod).toBe(authMethod)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })
})
