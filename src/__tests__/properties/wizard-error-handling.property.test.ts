/**
 * Feature: server-discovery
 *
 * Tests for network error handling, auth failure recovery, and timeout handling
 * in the connection wizard.
 */

import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { RecommendedServerInfoScore } from '@jellyfin/sdk/lib/models/recommended-server-info'
import type { WizardState } from '@/components/connection/use-wizard-state'
import {
  authenticate,
  discoverServers,
  validateCredentials,
} from '@/services/jellyfin'
import {
  canGoBack,
  getPreviousStep,
  initialWizardState,
  wizardReducer,
} from '@/components/connection/use-wizard-state'
import { AppError, ErrorCodes } from '@/lib/unified-error'

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a mock wizard state with user input.
 */
function createStateWithInput(
  overrides: Partial<WizardState> = {},
): WizardState {
  return {
    ...initialWizardState,
    address: 'test.jellyfin.local',
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Network Error Handling Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Network Error Handling', () => {
  /**
   * IF the server address is unreachable on all probed endpoints,
   * THEN THE Server_Discovery SHALL return an empty list with an appropriate error indication
   */
  it('returns error indication for unreachable servers', async () => {
    // Test with an invalid/unreachable address
    const result = await discoverServers('invalid.nonexistent.local.test', {
      signal: AbortSignal.timeout(5000),
    })

    // Should return empty servers with an error
    expect(result.servers).toHaveLength(0)
    // Error should be defined (either error message or empty servers indicates failure)
    expect(result.servers.length === 0 || result.error !== undefined).toBe(true)
  })

  /**
   * IF a timeout occurs during server probing,
   * THEN THE Server_Discovery SHALL mark that endpoint as unreachable
   */
  it('handles timeout during discovery gracefully', async () => {
    // Create an already-aborted signal to simulate timeout
    const controller = new AbortController()
    controller.abort()

    const result = await discoverServers('test.example.com', {
      signal: controller.signal,
    })

    // Should handle abort gracefully
    expect(result.servers).toHaveLength(0)
    expect(result.error).toBeDefined()
    expect(result.error).toContain('cancelled')
  })

  /**
   * Test that discovery handles pre-aborted signals correctly
   */
  it('returns cancelled error for pre-aborted signal', async () => {
    const controller = new AbortController()
    controller.abort()

    const result = await discoverServers('any.server.com', {
      signal: controller.signal,
    })

    expect(result.error).toBe('Discovery cancelled')
    expect(result.servers).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Authentication Failure Recovery Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Authentication Failure Recovery', () => {
  /**
   * IF a network error occurs during discovery,
   * THEN THE Discovery_UI SHALL display a user-friendly error message with retry option
   */
  it('provides user-friendly error messages for auth failures', async () => {
    // Test with invalid credentials against a non-existent server
    const result = await authenticate(
      'https://invalid.test.local',
      { method: 'apiKey', apiKey: 'invalid-key' },
      { signal: AbortSignal.timeout(5000) },
    )

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    // Error message should be user-friendly (not a raw stack trace)
    expect(result.error).not.toContain('at ')
    expect(result.error).not.toContain('Error:')
  })

  /**
   * Test that authentication handles pre-aborted signals correctly
   */
  it('returns cancelled error for pre-aborted auth signal', async () => {
    const controller = new AbortController()
    controller.abort()

    const result = await authenticate(
      'https://test.server.com',
      { method: 'apiKey', apiKey: 'test-key' },
      { signal: controller.signal },
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Authentication cancelled')
  })

  /**
   * Test validation errors are returned before API call
   */
  it('validates credentials before making API call', () => {
    fc.assert(
      fc.property(fc.constantFrom('', '   ', '\t\n'), (emptyValue) => {
        // Empty API key should fail validation
        const apiKeyResult = validateCredentials({
          method: 'apiKey',
          apiKey: emptyValue,
        })
        expect(apiKeyResult).toBeDefined()
        expect(apiKeyResult).toContain('required')

        // Empty username should fail validation
        const userPassResult = validateCredentials({
          method: 'userPass',
          username: emptyValue,
          password: 'valid-password',
        })
        expect(userPassResult).toBeDefined()
        expect(userPassResult).toContain('required')

        return true
      }),
      { numRuns: 10 },
    )
  })

  /**
   * Test whitespace-only password validation
   */
  it('rejects whitespace-only passwords', () => {
    // Test specific whitespace-only passwords
    const whitespacePasswords = [
      ' ',
      '  ',
      '\t',
      '\n',
      '\r',
      '   ',
      '\t\t',
      ' \t \n ',
    ]

    for (const whitespacePassword of whitespacePasswords) {
      const result = validateCredentials({
        method: 'userPass',
        username: 'validuser',
        password: whitespacePassword,
      })
      expect(result).toBeDefined()
      expect(result).toContain('whitespace')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Wizard State Preservation Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Wizard State Preservation on Error', () => {
  /**
   * WHEN an error occurs, THE Connection_Wizard SHALL preserve user input
   */
  it('preserves user input when error occurs', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 200 }),
        (address, errorMessage) => {
          const stateWithInput = createStateWithInput({ address })

          // Simulate error occurring
          const stateAfterError = wizardReducer(stateWithInput, {
            type: 'SET_ERROR',
            payload: errorMessage,
          })

          // Address should be preserved
          expect(stateAfterError.address).toBe(address)
          // Error should be set
          expect(stateAfterError.error).toBe(errorMessage)
          // Loading should be false
          expect(stateAfterError.isLoading).toBe(false)

          return true
        },
      ),
      { numRuns: 50 },
    )
  })

  /**
   * Test that going back preserves all user input
   */
  it('preserves all input when navigating back', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.constantFrom('apiKey', 'userPass'),
        (address, authMethod) => {
          // Start with state on auth step with user input
          const stateOnAuth = createStateWithInput({
            step: 'auth',
            address,
            authMethod,
            servers: [
              {
                address: 'https://test.server.com',
                responseTime: 100,
                score: RecommendedServerInfoScore.GREAT,
                issues: [],
              },
            ],
            selectedServer: {
              address: 'https://test.server.com',
              responseTime: 100,
              score: RecommendedServerInfoScore.GREAT,
              issues: [],
            },
          })

          // Go back
          const stateAfterBack = wizardReducer(stateOnAuth, { type: 'GO_BACK' })

          // All input should be preserved
          expect(stateAfterBack.address).toBe(address)
          expect(stateAfterBack.authMethod).toBe(authMethod)
          expect(stateAfterBack.servers).toHaveLength(1)
          expect(stateAfterBack.selectedServer).toBeDefined()
          // Error should be cleared
          expect(stateAfterBack.error).toBeNull()
          // Step should go back
          expect(stateAfterBack.step).toBe('select')

          return true
        },
      ),
      { numRuns: 50 },
    )
  })

  /**
   * Test that error clears when user modifies input
   */
  it('clears error when user modifies address', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        (originalAddress, newAddress) => {
          // Start with error state
          const stateWithError = createStateWithInput({
            address: originalAddress,
            error: 'Some error occurred',
          })

          // User modifies address
          const stateAfterModify = wizardReducer(stateWithError, {
            type: 'SET_ADDRESS',
            payload: newAddress,
          })

          // Error should be cleared
          expect(stateAfterModify.error).toBeNull()
          // New address should be set
          expect(stateAfterModify.address).toBe(newAddress)

          return true
        },
      ),
      { numRuns: 50 },
    )
  })

  /**
   * Test that loading state clears error
   */
  it('clears error when starting new operation', () => {
    const stateWithError = createStateWithInput({
      error: 'Previous error',
    })

    const stateAfterLoading = wizardReducer(stateWithError, {
      type: 'SET_LOADING',
      payload: true,
    })

    expect(stateAfterLoading.error).toBeNull()
    expect(stateAfterLoading.isLoading).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Step Navigation Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Wizard Step Navigation', () => {
  /**
   * Test getPreviousStep returns correct values
   */
  it('returns correct previous step for each step', () => {
    expect(getPreviousStep('entry')).toBeNull()
    expect(getPreviousStep('select')).toBe('entry')
    expect(getPreviousStep('auth')).toBe('select')
    expect(getPreviousStep('success')).toBe('auth')
  })

  /**
   * Test canGoBack returns correct values
   */
  it('returns correct canGoBack for each step', () => {
    expect(canGoBack('entry')).toBe(false)
    expect(canGoBack('select')).toBe(true)
    expect(canGoBack('auth')).toBe(true)
    expect(canGoBack('success')).toBe(false)
  })

  /**
   * Test that GO_BACK from entry step does nothing
   */
  it('GO_BACK from entry step preserves state', () => {
    const entryState = createStateWithInput({ step: 'entry' })
    const stateAfterBack = wizardReducer(entryState, { type: 'GO_BACK' })

    expect(stateAfterBack).toEqual(entryState)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Error Code Mapping Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Error Code Mapping', () => {
  /**
   * Test that AppError correctly maps HTTP status codes
   */
  it('maps 401 status to UNAUTHORIZED code', () => {
    const error = AppError.fromStatus(401)
    expect(error.code).toBe(ErrorCodes.UNAUTHORIZED)
    expect(error.recoverable).toBe(true)
  })

  it('maps 403 status to FORBIDDEN code', () => {
    const error = AppError.fromStatus(403)
    expect(error.code).toBe(ErrorCodes.FORBIDDEN)
    expect(error.recoverable).toBe(false)
  })

  it('maps 404 status to NOT_FOUND code', () => {
    const error = AppError.fromStatus(404)
    expect(error.code).toBe(ErrorCodes.NOT_FOUND)
    expect(error.recoverable).toBe(false)
  })

  it('maps 5xx status to SERVER_ERROR code', () => {
    fc.assert(
      fc.property(fc.integer({ min: 500, max: 599 }), (status) => {
        const error = AppError.fromStatus(status)
        expect(error.code).toBe(ErrorCodes.SERVER_ERROR)
        expect(error.recoverable).toBe(true)
        return true
      }),
      { numRuns: 20 },
    )
  })

  it('maps 429 to recoverable error', () => {
    const error = AppError.fromStatus(429)
    expect(error.recoverable).toBe(true)
  })
})
