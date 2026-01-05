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
import { AxiosError } from 'axios'
import type { AxiosResponse } from 'axios'
import { useApiStore } from '@/stores/api-store'

// Response type definitions for property testing
type ResponseType =
  | 'success'
  | 'auth_failure'
  | 'server_error'
  | 'network_error'

// Create mock system API that we can control per-test
const mockGetSystemInfo = vi.fn()
const mockSystemApi = { getSystemInfo: mockGetSystemInfo }
const mockApis = {
  systemApi: mockSystemApi,
  itemsApi: {},
  libraryApi: {},
  tvShowsApi: {},
  imageApi: {},
  videosApi: {},
  pluginsApi: {},
  mediaSegmentsApi: {},
  api: { basePath: 'http://localhost:8096', axiosInstance: {} },
}

// Mock the SDK module
vi.mock('@/services/jellyfin/sdk', () => ({
  getTypedApis: vi.fn(() => mockApis),
  buildUrl: vi.fn((path: string) => `http://localhost:8096${path}`),
  getApi: vi.fn(() => ({
    basePath: 'http://localhost:8096',
    axiosInstance: {},
  })),
  clearApiCache: vi.fn(),
  getRequestConfig: vi.fn((options?: { signal?: AbortSignal; timeout?: number }, defaultTimeout = 30000) => ({
    signal: options?.signal,
    timeout: options?.timeout ?? defaultTimeout,
  })),
  withApi: vi.fn(async (fn: (apis: typeof mockApis) => Promise<unknown>, options?: { signal?: AbortSignal }) => {
    if (options?.signal?.aborted) return null
    return fn(mockApis)
  }),
}))

// Custom arbitrary for hex strings (API keys)
const hexStringArb = (length: number) =>
  fc
    .array(fc.constantFrom(...'0123456789abcdef'.split('')), {
      minLength: length,
      maxLength: length,
    })
    .map((chars) => chars.join(''))

describe('Connection State Management', () => {
  // Store original state
  let originalState: ReturnType<typeof useApiStore.getState>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn> | undefined
  let consoleWarnSpy: ReturnType<typeof vi.spyOn> | undefined

  beforeEach(() => {
    // Property tests intentionally explore failing states; keep output clean.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Save original state
    originalState = useApiStore.getState()

    // Reset store to initial state
    useApiStore.setState({
      serverAddress: 'http://localhost:8096',
      apiKey: 'test-api-key',
      serverVersion: '',
      validConnection: false,
      validAuth: false,
    })

    // Clear the mock
    mockGetSystemInfo.mockReset()
  })

  afterEach(() => {
    consoleErrorSpy?.mockRestore()
    consoleWarnSpy?.mockRestore()

    // Restore original state
    useApiStore.setState(originalState)
  })

  // Helper to setup mock SDK response
  function setupMockSdkResponse(
    type: ResponseType,
    version: string = '10.8.0',
  ) {
    switch (type) {
      case 'success':
        mockGetSystemInfo.mockResolvedValueOnce({
          data: { Version: version },
          status: 200,
        } as AxiosResponse)
        break
      case 'auth_failure': {
        const authError = new AxiosError('Unauthorized')
        authError.response = {
          status: 401,
          data: { message: 'Unauthorized' },
          statusText: 'Unauthorized',
          headers: {},
          config: {} as never,
        }
        mockGetSystemInfo.mockRejectedValueOnce(authError)
        break
      }
      case 'server_error': {
        const serverError = new AxiosError('Server Error')
        serverError.response = {
          status: 500,
          data: { message: 'Server Error' },
          statusText: 'Internal Server Error',
          headers: {},
          config: {} as never,
        }
        mockGetSystemInfo.mockRejectedValueOnce(serverError)
        break
      }
      case 'network_error':
        mockGetSystemInfo.mockRejectedValueOnce(new AxiosError('Network Error'))
        break
    }
  }

  /**
   * Property: Successful responses set validConnection and validAuth to true
   * For any successful server response (200 OK), the store should reflect
   * a valid connection with valid authentication.
   */
  it('sets validConnection and validAuth to true on successful response', async () => {
    const { testConnection } = await import('@/services/jellyfin/client')

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          serverAddress: fc.webUrl(),
          apiKey: hexStringArb(32),
          version: fc.stringMatching(/^\d+\.\d+\.\d+$/),
        }),
        async ({ serverAddress, apiKey, version }) => {
          // Reset state for this iteration
          mockGetSystemInfo.mockReset()
          useApiStore.setState({
            serverAddress,
            apiKey,
            validConnection: false,
            validAuth: false,
          })

          // Setup successful response
          setupMockSdkResponse('success', version)

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
   * Property: 401 responses set validAuth to false but validConnection to true
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
          // Reset state for this iteration
          mockGetSystemInfo.mockReset()
          useApiStore.setState({
            serverAddress,
            apiKey,
            validConnection: true,
            validAuth: true,
          })

          // Setup 401 response
          setupMockSdkResponse('auth_failure')

          // Test connection
          const result = await testConnection()

          // Verify result - 401 means server is reachable but auth failed
          expect(result.valid).toBe(true)
          expect(result.authenticated).toBe(false)

          // Verify store state
          const state = useApiStore.getState()
          expect(state.validConnection).toBe(true)
          expect(state.validAuth).toBe(false)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Network errors set both validConnection and validAuth to false
   * For any network error (axios throws), both connection and auth should be invalid.
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
          // Reset state for this iteration
          mockGetSystemInfo.mockReset()
          useApiStore.setState({
            serverAddress,
            apiKey,
            validConnection: true,
            validAuth: true,
          })

          // Setup network error
          setupMockSdkResponse('network_error')

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
        }),
        async ({ serverAddress, apiKey }) => {
          // Reset state for this iteration
          mockGetSystemInfo.mockReset()
          useApiStore.setState({
            serverAddress,
            apiKey,
            validConnection: true,
            validAuth: true,
          })

          // Setup server error response
          setupMockSdkResponse('server_error')

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
          // Reset state for this iteration
          mockGetSystemInfo.mockReset()
          useApiStore.setState({
            serverAddress: 'http://localhost:8096',
            apiKey: 'test-key',
            validConnection: false,
            validAuth: false,
          })

          // Process each response in sequence
          for (const responseType of responseSequence) {
            setupMockSdkResponse(responseType)
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
              expect(state.validConnection).toBe(true)
              expect(state.validAuth).toBe(false)
              break
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
