/**
 * Property: Wizard State Preservation
 *
 * *For any* wizard state with user-entered data (server address, selected server,
 * auth method), navigating backward or encountering an error SHALL preserve all
 * previously entered values.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { RecommendedServerInfoScore } from '@jellyfin/sdk/lib/models/recommended-server-info'
import type { RecommendedServerInfo } from '@jellyfin/sdk/lib/models/recommended-server-info'
import type { AuthMethod } from '@/stores/api-store'
import type {
  WizardState,
  WizardStep,
} from '@/components/connection/use-wizard-state'
import {
  canGoBack,
  getNextStep,
  getPreviousStep,
  initialWizardState,
  wizardReducer,
} from '@/components/connection/use-wizard-state'

// ─────────────────────────────────────────────────────────────────────────────
// Arbitraries
// ─────────────────────────────────────────────────────────────────────────────

/** Arbitrary for wizard steps */
const wizardStepArb = fc.constantFrom<WizardStep>(
  'entry',
  'select',
  'auth',
  'success',
)

/** Arbitrary for auth methods */
const authMethodArb = fc.constantFrom<AuthMethod>('apiKey', 'userPass')

/** Arbitrary for server scores */
const serverScoreArb = fc.constantFrom(
  RecommendedServerInfoScore.GREAT,
  RecommendedServerInfoScore.GOOD,
  RecommendedServerInfoScore.OK,
  RecommendedServerInfoScore.BAD,
)

/** Arbitrary for server protocol (http or https) */
const protocolArb = fc.constantFrom('http', 'https')

/** Arbitrary for valid server addresses */
const serverAddressArb = fc
  .tuple(protocolArb, fc.domain(), fc.nat({ max: 65535 }))
  .map(([protocol, domain, port]) => `${protocol}://${domain}:${port}`)

/** Arbitrary for mock server info */
const serverInfoArb: fc.Arbitrary<RecommendedServerInfo> = fc.record({
  address: serverAddressArb,
  responseTime: fc.nat({ max: 5000 }),
  score: serverScoreArb,
  issues: fc.constant([]),
  systemInfo: fc.constant(undefined),
})

/** Arbitrary for user-entered address (simple string for wizard state) */
const userAddressArb = fc.string({ minLength: 1, maxLength: 200 })

/** Arbitrary for wizard state with user data */
const wizardStateWithDataArb: fc.Arbitrary<WizardState> = fc.record({
  step: wizardStepArb,
  address: userAddressArb,
  servers: fc.array(serverInfoArb, { minLength: 0, maxLength: 5 }),
  selectedServer: fc.option(serverInfoArb, { nil: null }),
  authMethod: authMethodArb,
  error: fc.option(fc.string({ minLength: 1 }), { nil: null }),
  isLoading: fc.boolean(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Property: Wizard State Preservation', () => {
  /**
   * Property: GO_BACK preserves all user-entered data
   * For any wizard state with user data, going back should preserve
   * address, servers, selectedServer, and authMethod.
   */
  it('GO_BACK preserves all user-entered data', () => {
    fc.assert(
      fc.property(wizardStateWithDataArb, (state) => {
        // Only test states where back navigation is possible
        if (!canGoBack(state.step)) return true

        const previousStep = getPreviousStep(state.step)
        if (!previousStep) return true

        // Apply GO_BACK action
        const newState = wizardReducer(state, { type: 'GO_BACK' })

        // Verify step changed
        expect(newState.step).toBe(previousStep)

        // Verify all user data is preserved
        expect(newState.address).toBe(state.address)
        expect(newState.servers).toEqual(state.servers)
        expect(newState.selectedServer).toEqual(state.selectedServer)
        expect(newState.authMethod).toBe(state.authMethod)

        // Error should be cleared on navigation
        expect(newState.error).toBeNull()
        // Loading should be cleared on navigation
        expect(newState.isLoading).toBe(false)

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: SET_ERROR preserves all user-entered data
   * For any wizard state, setting an error should preserve all user input.
   */
  it('SET_ERROR preserves all user-entered data', () => {
    fc.assert(
      fc.property(
        wizardStateWithDataArb,
        fc.string({ minLength: 1, maxLength: 100 }),
        (state, errorMessage) => {
          // Apply SET_ERROR action
          const newState = wizardReducer(state, {
            type: 'SET_ERROR',
            payload: errorMessage,
          })

          // Verify error is set
          expect(newState.error).toBe(errorMessage)

          // Verify all user data is preserved
          expect(newState.step).toBe(state.step)
          expect(newState.address).toBe(state.address)
          expect(newState.servers).toEqual(state.servers)
          expect(newState.selectedServer).toEqual(state.selectedServer)
          expect(newState.authMethod).toBe(state.authMethod)

          // Loading should be cleared when error is set
          expect(newState.isLoading).toBe(false)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Multiple GO_BACK actions preserve data through all steps
   * For any wizard state at 'auth' step, going back twice should
   * preserve all user data and end at 'entry' step.
   */
  it('multiple GO_BACK actions preserve data through all steps', () => {
    fc.assert(
      fc.property(
        userAddressArb,
        fc.array(serverInfoArb, { minLength: 1, maxLength: 5 }),
        serverInfoArb,
        authMethodArb,
        (address, servers, selectedServer, authMethod) => {
          // Start at 'auth' step with user data
          const initialState: WizardState = {
            step: 'auth',
            address,
            servers,
            selectedServer,
            authMethod,
            error: null,
            isLoading: false,
          }

          // Go back to 'select'
          const afterFirstBack = wizardReducer(initialState, {
            type: 'GO_BACK',
          })
          expect(afterFirstBack.step).toBe('select')
          expect(afterFirstBack.address).toBe(address)
          expect(afterFirstBack.servers).toEqual(servers)
          expect(afterFirstBack.selectedServer).toEqual(selectedServer)
          expect(afterFirstBack.authMethod).toBe(authMethod)

          // Go back to 'entry'
          const afterSecondBack = wizardReducer(afterFirstBack, {
            type: 'GO_BACK',
          })
          expect(afterSecondBack.step).toBe('entry')
          expect(afterSecondBack.address).toBe(address)
          expect(afterSecondBack.servers).toEqual(servers)
          expect(afterSecondBack.selectedServer).toEqual(selectedServer)
          expect(afterSecondBack.authMethod).toBe(authMethod)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Error followed by user action clears error but preserves data
   * For any state with an error, user actions (SET_ADDRESS, SELECT_SERVER,
   * SET_AUTH_METHOD) should clear the error while preserving other data.
   */
  it('user actions clear error but preserve other data', () => {
    fc.assert(
      fc.property(
        wizardStateWithDataArb,
        userAddressArb,
        (state, newAddress) => {
          // Ensure state has an error
          const stateWithError: WizardState = {
            ...state,
            error: 'Some error message',
          }

          // Apply SET_ADDRESS action
          const newState = wizardReducer(stateWithError, {
            type: 'SET_ADDRESS',
            payload: newAddress,
          })

          // Error should be cleared
          expect(newState.error).toBeNull()

          // Address should be updated
          expect(newState.address).toBe(newAddress)

          // Other user data should be preserved
          expect(newState.step).toBe(stateWithError.step)
          expect(newState.servers).toEqual(stateWithError.servers)
          expect(newState.selectedServer).toEqual(stateWithError.selectedServer)
          expect(newState.authMethod).toBe(stateWithError.authMethod)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: SELECT_SERVER clears error and preserves other data
   */
  it('SELECT_SERVER clears error and preserves other data', () => {
    fc.assert(
      fc.property(wizardStateWithDataArb, serverInfoArb, (state, newServer) => {
        // Ensure state has an error
        const stateWithError: WizardState = {
          ...state,
          error: 'Some error message',
        }

        // Apply SELECT_SERVER action
        const newState = wizardReducer(stateWithError, {
          type: 'SELECT_SERVER',
          payload: newServer,
        })

        // Error should be cleared
        expect(newState.error).toBeNull()

        // Selected server should be updated
        expect(newState.selectedServer).toEqual(newServer)

        // Other user data should be preserved
        expect(newState.step).toBe(stateWithError.step)
        expect(newState.address).toBe(stateWithError.address)
        expect(newState.servers).toEqual(stateWithError.servers)
        expect(newState.authMethod).toBe(stateWithError.authMethod)

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: SET_AUTH_METHOD clears error and preserves other data
   */
  it('SET_AUTH_METHOD clears error and preserves other data', () => {
    fc.assert(
      fc.property(wizardStateWithDataArb, authMethodArb, (state, newMethod) => {
        // Ensure state has an error
        const stateWithError: WizardState = {
          ...state,
          error: 'Some error message',
        }

        // Apply SET_AUTH_METHOD action
        const newState = wizardReducer(stateWithError, {
          type: 'SET_AUTH_METHOD',
          payload: newMethod,
        })

        // Error should be cleared
        expect(newState.error).toBeNull()

        // Auth method should be updated
        expect(newState.authMethod).toBe(newMethod)

        // Other user data should be preserved
        expect(newState.step).toBe(stateWithError.step)
        expect(newState.address).toBe(stateWithError.address)
        expect(newState.servers).toEqual(stateWithError.servers)
        expect(newState.selectedServer).toEqual(stateWithError.selectedServer)

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: canGoBack returns correct values for each step
   */
  it('canGoBack returns correct values for each step', () => {
    // Entry step - cannot go back (first step)
    expect(canGoBack('entry')).toBe(false)

    // Select step - can go back to entry
    expect(canGoBack('select')).toBe(true)

    // Auth step - can go back to select
    expect(canGoBack('auth')).toBe(true)

    // Success step - cannot go back (final step)
    expect(canGoBack('success')).toBe(false)
  })

  /**
   * Property: getPreviousStep returns correct step for each position
   */
  it('getPreviousStep returns correct step for each position', () => {
    expect(getPreviousStep('entry')).toBeNull()
    expect(getPreviousStep('select')).toBe('entry')
    expect(getPreviousStep('auth')).toBe('select')
    expect(getPreviousStep('success')).toBe('auth')
  })

  /**
   * Property: getNextStep returns correct step for each position
   */
  it('getNextStep returns correct step for each position', () => {
    expect(getNextStep('entry')).toBe('select')
    expect(getNextStep('select')).toBe('auth')
    expect(getNextStep('auth')).toBe('success')
    expect(getNextStep('success')).toBeNull()
  })

  /**
   * Property: RESET returns to initial state
   */
  it('RESET returns to initial state regardless of current state', () => {
    fc.assert(
      fc.property(wizardStateWithDataArb, (state) => {
        const newState = wizardReducer(state, { type: 'RESET' })

        expect(newState).toEqual(initialWizardState)

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: GO_BACK from entry step is a no-op
   */
  it('GO_BACK from entry step is a no-op', () => {
    fc.assert(
      fc.property(
        userAddressArb,
        fc.array(serverInfoArb, { minLength: 0, maxLength: 3 }),
        authMethodArb,
        (address, servers, authMethod) => {
          const state: WizardState = {
            step: 'entry',
            address,
            servers,
            selectedServer: null,
            authMethod,
            error: null,
            isLoading: false,
          }

          const newState = wizardReducer(state, { type: 'GO_BACK' })

          // State should be unchanged
          expect(newState).toEqual(state)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: DISCOVERY_SUCCESS transitions to select and preserves address
   */
  it('DISCOVERY_SUCCESS transitions to select and preserves address', () => {
    fc.assert(
      fc.property(
        userAddressArb,
        fc.array(serverInfoArb, { minLength: 1, maxLength: 5 }),
        (address, servers) => {
          const state: WizardState = {
            step: 'entry',
            address,
            servers: [],
            selectedServer: null,
            authMethod: 'apiKey',
            error: null,
            isLoading: true,
          }

          const newState = wizardReducer(state, {
            type: 'DISCOVERY_SUCCESS',
            payload: servers,
          })

          // Should transition to select step
          expect(newState.step).toBe('select')

          // Address should be preserved
          expect(newState.address).toBe(address)

          // Servers should be set
          expect(newState.servers).toEqual(servers)

          // Loading should be cleared
          expect(newState.isLoading).toBe(false)

          // Error should be cleared
          expect(newState.error).toBeNull()

          // If only one server, it should be auto-selected
          if (servers.length === 1) {
            expect(newState.selectedServer).toEqual(servers[0])
          }

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: AUTH_SUCCESS transitions to success and preserves all data
   */
  it('AUTH_SUCCESS transitions to success and preserves all data', () => {
    fc.assert(
      fc.property(
        userAddressArb,
        fc.array(serverInfoArb, { minLength: 1, maxLength: 5 }),
        serverInfoArb,
        authMethodArb,
        (address, servers, selectedServer, authMethod) => {
          const state: WizardState = {
            step: 'auth',
            address,
            servers,
            selectedServer,
            authMethod,
            error: null,
            isLoading: true,
          }

          const newState = wizardReducer(state, { type: 'AUTH_SUCCESS' })

          // Should transition to success step
          expect(newState.step).toBe('success')

          // All user data should be preserved
          expect(newState.address).toBe(address)
          expect(newState.servers).toEqual(servers)
          expect(newState.selectedServer).toEqual(selectedServer)
          expect(newState.authMethod).toBe(authMethod)

          // Loading should be cleared
          expect(newState.isLoading).toBe(false)

          // Error should be cleared
          expect(newState.error).toBeNull()

          return true
        },
      ),
      { numRuns: 100 },
    )
  })
})
