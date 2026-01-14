/**
 * Feature: Connection State Management
 * Tests for the API store's connection state management functions.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { useApiStore } from '@/stores/api-store'

describe('Connection State Management', () => {
  let originalState: ReturnType<typeof useApiStore.getState>

  beforeEach(() => {
    originalState = useApiStore.getState()
    useApiStore.setState({
      serverAddress: 'http://localhost:8096',
      apiKey: 'test-api-key',
      serverVersion: '',
      validConnection: false,
      validAuth: false,
    })
  })

  afterEach(() => {
    useApiStore.setState(originalState)
  })

  /**
   * Property: setConnectionStatus correctly updates state
   * For any combination of valid and auth boolean values,
   * setConnectionStatus should update the store correctly.
   */
  it('setConnectionStatus updates state correctly', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (valid, auth) => {
        useApiStore.getState().setConnectionStatus(valid, auth)

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
          useApiStore.setState({
            validConnection: initialValid,
            validAuth: initialAuth,
            serverVersion: initialVersion,
          })

          useApiStore.getState().resetConnection()

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

  /**
   * Property: setServerVersion updates version correctly
   */
  it('setServerVersion updates version correctly', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^\d+\.\d+\.\d+$/), (version) => {
        useApiStore.getState().setServerVersion(version)

        const state = useApiStore.getState()
        expect(state.serverVersion).toBe(version)

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Connection state is independent of credentials
   * Setting credentials should not affect connection state.
   */
  it('credential changes do not affect connection state', () => {
    fc.assert(
      fc.property(
        fc.webUrl(),
        fc.string({ minLength: 32, maxLength: 32 }),
        fc.boolean(),
        fc.boolean(),
        (serverAddress, apiKey, validConnection, validAuth) => {
          // Set initial connection state
          useApiStore.setState({ validConnection, validAuth })

          // Change credentials
          useApiStore.getState().setServerAddress(serverAddress)
          useApiStore.getState().setApiKey(apiKey)

          // Connection state should be unchanged
          const state = useApiStore.getState()
          expect(state.validConnection).toBe(validConnection)
          expect(state.validAuth).toBe(validAuth)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })
})
