/**
 * Feature: Connection State Management
 * For any server response (success, failure, or 401), the connection state
 * (validConnection, validAuth) SHALL correctly reflect the response status,
 * and appropriate notifications SHALL be triggered for failures.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fc from 'fast-check'
import { useApiStore } from '@/stores/api-store'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Custom arbitrary for hex strings (API keys)
const hexStringArb = (length: number) =>
  fc
    .array(fc.constantFrom(...'0123456789abcdef'.split('')), {
      minLength: length,
      maxLength: length,
    })
    .map((chars) => chars.join(''))

// Response type definitions for property testing
type ResponseType =
  | 'success'
  | 'auth_failure'
  | 'server_error'
  | 'network_error'

interface MockResponse {
  type: ResponseType
  status: number
  ok: boolean
  body?: object
}

// Generate mock responses based on type
function createMockResponse(type: ResponseType): MockResponse {
  switch (type) {
    case 'success':
      return {
        type,
        status: 200,
        ok: true,
        body: { Version: '10.8.0' },
      }
    case 'auth_failure':
      return {
        type,
        status: 401,
        ok: false,
        body: { message: 'Unauthorized' },
      }
    case 'server_error':
      return {
        type,
        status: 500,
        ok: false,
        body: { message: 'Internal Server Error' },
      }
    case 'network_error':
      return {
        type,
        status: 0,
        ok: false,
      }
  }
}

// Setup mock fetch to return specific response
function setupMockFetch(response: MockResponse): void {
  if (response.type === 'network_error') {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
  } else {
    mockFetch.mockResolvedValueOnce({
      ok: response.ok,
      status: response.status,
      statusText: response.status === 401 ? 'Unauthorized' : 'OK',
      json: () => Promise.resolve(response.body),
      text: () => Promise.resolve(JSON.stringify(response.body)),
    })
  }
}

describe('Connection State Management', () => {
  // Store original state
  let originalState: ReturnType<typeof useApiStore.getState>

  beforeEach(() => {
    // Save original state
    originalState = useApiStore.getState()

    // Reset store to initial state
    useApiStore.setState({
      serverAddress: 'http://localhost:8096',
      apiKey: 'test-api-key',
      serverVersion: '',
      validConnection: false,
      validAuth: false,
      isPluginMode: false,
    })

    // Clear mock
    mockFetch.mockClear()
  })

  afterEach(() => {
    // Restore original state
    useApiStore.setState(originalState)
  })

  /**
   * Property: Successful responses set validConnection and validAuth to true
   * For any successful server response (200 OK), the store should reflect
   * a valid connection with valid authentication.
   */
  it('sets validConnection and validAuth to true on successful response', async () => {
    // Import testConnection dynamically to use mocked fetch
    const { testConnection } = await import('@/services/jellyfin/client')

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          serverAddress: fc.webUrl(),
          apiKey: hexStringArb(32),
          version: fc.stringMatching(/^\d+\.\d+\.\d+$/),
        }),
        async ({ serverAddress, apiKey, version }) => {
          // Setup store with generated values
          useApiStore.setState({
            serverAddress,
            apiKey,
            validConnection: false,
            validAuth: false,
          })

          // Setup successful response
          setupMockFetch({
            type: 'success',
            status: 200,
            ok: true,
            body: { Version: version },
          })

          // Test connection
          const result = await testConnection()

          // Verify result
          expect(result.valid).toBe(true)
          expect(result.authenticated).toBe(true)
          expect(result.serverVersion).toBe(version)

          // Verify store state
          const state = useApiStore.getState()
          expect(state.validConnection).toBe(true)
          expect(state.validAuth).toBe(true)
          expect(state.serverVersion).toBe(version)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: 401 responses set validAuth to false
   * For any 401 Unauthorized response, the store should reflect
   * that authentication has failed while connection may still be valid.
   */
  it('sets validAuth to false on 401 response', async () => {
    const { testConnection } = await import('@/services/jellyfin/client')

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          serverAddress: fc.webUrl(),
          apiKey: hexStringArb(32),
        }),
        async ({ serverAddress, apiKey }) => {
          // Setup store
          useApiStore.setState({
            serverAddress,
            apiKey,
            validConnection: true,
            validAuth: true,
          })

          // Setup 401 response
          setupMockFetch(createMockResponse('auth_failure'))

          // Test connection
          const result = await testConnection()

          // Verify result - 401 means server is reachable but auth failed
          expect(result.valid).toBe(false)
          expect(result.authenticated).toBe(false)

          // Verify store state
          const state = useApiStore.getState()
          expect(state.validConnection).toBe(false)
          expect(state.validAuth).toBe(false)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Network errors set both validConnection and validAuth to false
   * For any network error (fetch throws), both connection and auth should be invalid.
   */
  it('sets validConnection and validAuth to false on network error', async () => {
    const { testConnection } = await import('@/services/jellyfin/client')

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          serverAddress: fc.webUrl(),
          apiKey: hexStringArb(32),
        }),
        async ({ serverAddress, apiKey }) => {
          // Setup store with initially valid connection
          useApiStore.setState({
            serverAddress,
            apiKey,
            validConnection: true,
            validAuth: true,
          })

          // Setup network error
          setupMockFetch(createMockResponse('network_error'))

          // Test connection
          const result = await testConnection()

          // Verify result
          expect(result.valid).toBe(false)
          expect(result.authenticated).toBe(false)
          expect(result.serverVersion).toBe('')

          // Verify store state
          const state = useApiStore.getState()
          expect(state.validConnection).toBe(false)
          expect(state.validAuth).toBe(false)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Server errors (5xx) set validConnection to false
   * For any server error response, the connection should be marked invalid.
   */
  it('sets validConnection to false on server error', async () => {
    const { testConnection } = await import('@/services/jellyfin/client')

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          serverAddress: fc.webUrl(),
          apiKey: hexStringArb(32),
          errorStatus: fc.integer({ min: 500, max: 599 }),
        }),
        async ({ serverAddress, apiKey, errorStatus }) => {
          // Setup store
          useApiStore.setState({
            serverAddress,
            apiKey,
            validConnection: true,
            validAuth: true,
          })

          // Setup server error response
          mockFetch.mockResolvedValueOnce({
            ok: false,
            status: errorStatus,
            statusText: 'Server Error',
            json: () => Promise.resolve({ message: 'Server Error' }),
            text: () =>
              Promise.resolve(JSON.stringify({ message: 'Server Error' })),
          })

          // Test connection
          const result = await testConnection()

          // Verify result
          expect(result.valid).toBe(false)

          // Verify store state
          const state = useApiStore.getState()
          expect(state.validConnection).toBe(false)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Connection state transitions are consistent
   * For any sequence of response types, the final state should match
   * the expected state for the last response type.
   */
  it('maintains consistent state through response sequences', async () => {
    const { testConnection } = await import('@/services/jellyfin/client')

    const responseTypeArb = fc.constantFrom<ResponseType>(
      'success',
      'auth_failure',
      'server_error',
      'network_error',
    )

    await fc.assert(
      fc.asyncProperty(
        fc.array(responseTypeArb, { minLength: 1, maxLength: 5 }),
        async (responseSequence) => {
          // Setup initial store state
          useApiStore.setState({
            serverAddress: 'http://localhost:8096',
            apiKey: 'test-key',
            validConnection: false,
            validAuth: false,
          })

          // Process each response in sequence
          for (const responseType of responseSequence) {
            setupMockFetch(createMockResponse(responseType))
            await testConnection()
          }

          // Verify final state matches expected for last response
          const lastResponse = responseSequence[responseSequence.length - 1]
          const state = useApiStore.getState()

          switch (lastResponse) {
            case 'success':
              expect(state.validConnection).toBe(true)
              expect(state.validAuth).toBe(true)
              break
            case 'auth_failure':
            case 'server_error':
            case 'network_error':
              expect(state.validConnection).toBe(false)
              break
          }

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: setConnectionStatus correctly updates state
   * For any combination of valid and auth boolean values,
   * setConnectionStatus should update the store correctly.
   */
  it('setConnectionStatus updates state correctly', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (valid, auth) => {
        // Set connection status
        useApiStore.getState().setConnectionStatus(valid, auth)

        // Verify state
        const state = useApiStore.getState()
        expect(state.validConnection).toBe(valid)
        expect(state.validAuth).toBe(auth)

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: resetConnection clears connection state
   * After resetConnection is called, validConnection, validAuth,
   * and serverVersion should all be reset.
   */
  it('resetConnection clears connection state', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.string(),
        (initialValid, initialAuth, initialVersion) => {
          // Set initial state
          useApiStore.setState({
            validConnection: initialValid,
            validAuth: initialAuth,
            serverVersion: initialVersion,
          })

          // Reset connection
          useApiStore.getState().resetConnection()

          // Verify state is reset
          const state = useApiStore.getState()
          expect(state.validConnection).toBe(false)
          expect(state.validAuth).toBe(false)
          expect(state.serverVersion).toBe('')

          return true
        },
      ),
      { numRuns: 100 },
    )
  })
})
