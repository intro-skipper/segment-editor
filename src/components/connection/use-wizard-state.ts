/**
 * Connection Wizard State Management
 *
 * Implements a state machine for the multi-step connection wizard flow:
 * entry → select → auth → success
 *
 * Preserves user input when navigating back or encountering errors.
 *
 * @module components/connection/use-wizard-state
 */

import { useCallback, useReducer } from 'react'
import type { RecommendedServerInfo } from '@jellyfin/sdk/lib/models/recommended-server-info'
import type { AuthMethod } from '@/stores/api-store'
import { findBestServer } from '@/services/jellyfin'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type WizardStep = 'entry' | 'select' | 'auth' | 'success'

export interface WizardState {
  /** Current step in the wizard flow */
  step: WizardStep
  /** User-entered server address */
  address: string
  /** Discovered servers from probing */
  servers: Array<RecommendedServerInfo>
  /** Currently selected server for authentication */
  selectedServer: RecommendedServerInfo | null
  /** Selected authentication method */
  authMethod: AuthMethod
  /** Current error message, if any */
  error: string | null
  /** Whether an async operation is in progress */
  isLoading: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────────

type WizardAction =
  | { type: 'SET_ADDRESS'; payload: string }
  | { type: 'SET_SERVERS'; payload: Array<RecommendedServerInfo> }
  | { type: 'SELECT_SERVER'; payload: RecommendedServerInfo }
  | { type: 'SET_AUTH_METHOD'; payload: AuthMethod }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'GO_TO_STEP'; payload: WizardStep }
  | { type: 'GO_BACK' }
  | { type: 'RESET' }
  | { type: 'DISCOVERY_SUCCESS'; payload: Array<RecommendedServerInfo> }
  | { type: 'AUTH_SUCCESS' }

// ─────────────────────────────────────────────────────────────────────────────
// Initial State
// ─────────────────────────────────────────────────────────────────────────────

export const initialWizardState: WizardState = {
  step: 'entry',
  address: '',
  servers: [],
  selectedServer: null,
  authMethod: 'apiKey',
  error: null,
  isLoading: false,
}

// ─────────────────────────────────────────────────────────────────────────────
// Step Navigation
// ─────────────────────────────────────────────────────────────────────────────

const STEP_ORDER: Array<WizardStep> = ['entry', 'select', 'auth', 'success']

/**
 * Gets the previous step in the wizard flow.
 * Returns null if already at the first step.
 */
export function getPreviousStep(currentStep: WizardStep): WizardStep | null {
  const currentIndex = STEP_ORDER.indexOf(currentStep)
  if (currentIndex <= 0) return null
  return STEP_ORDER[currentIndex - 1] ?? null
}

/**
 * Gets the next step in the wizard flow.
 * Returns null if already at the last step.
 */
export function getNextStep(currentStep: WizardStep): WizardStep | null {
  const currentIndex = STEP_ORDER.indexOf(currentStep)
  if (currentIndex < 0 || currentIndex >= STEP_ORDER.length - 1) return null
  return STEP_ORDER[currentIndex + 1] ?? null
}

/**
 * Checks if back navigation is allowed from the current step.
 */
export function canGoBack(step: WizardStep): boolean {
  return step !== 'entry' && step !== 'success'
}

// ─────────────────────────────────────────────────────────────────────────────
// Reducer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wizard state reducer.
 * Handles all state transitions while preserving user input.
 */
export function wizardReducer(
  state: WizardState,
  action: WizardAction,
): WizardState {
  switch (action.type) {
    case 'SET_ADDRESS':
      return {
        ...state,
        address: action.payload,
        // Clear error when user modifies input
        error: null,
      }

    case 'SET_SERVERS':
      return {
        ...state,
        servers: action.payload,
      }

    case 'SELECT_SERVER':
      return {
        ...state,
        selectedServer: action.payload,
        // Clear error when user selects a server
        error: null,
      }

    case 'SET_AUTH_METHOD':
      return {
        ...state,
        authMethod: action.payload,
        // Clear error when user changes auth method
        error: null,
      }

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        isLoading: false,
      }

    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
        // Clear error when starting a new operation
        error: action.payload ? null : state.error,
      }

    case 'GO_TO_STEP':
      return {
        ...state,
        step: action.payload,
        error: null,
      }

    case 'GO_BACK': {
      const previousStep = getPreviousStep(state.step)
      if (!previousStep) return state

      // Preserve all user input when going back
      return {
        ...state,
        step: previousStep,
        error: null,
        isLoading: false,
      }
    }

    case 'RESET':
      return initialWizardState

    case 'DISCOVERY_SUCCESS':
      return {
        ...state,
        servers: action.payload,
        // Auto-select best server (highest score, prefers HTTPS)
        selectedServer: findBestServer(action.payload),
        step: 'select',
        isLoading: false,
        error: null,
      }

    case 'AUTH_SUCCESS':
      return {
        ...state,
        step: 'success',
        isLoading: false,
        error: null,
      }

    default: {
      // Exhaustiveness check - TypeScript will error if a case is missing
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

interface UseWizardStateReturn {
  state: WizardState
  setAddress: (address: string) => void
  setServers: (servers: Array<RecommendedServerInfo>) => void
  selectServer: (server: RecommendedServerInfo) => void
  setAuthMethod: (method: AuthMethod) => void
  setError: (error: string | null) => void
  setLoading: (loading: boolean) => void
  goToStep: (step: WizardStep) => void
  goBack: () => void
  reset: () => void
  discoverySuccess: (servers: Array<RecommendedServerInfo>) => void
  authSuccess: () => void
  canGoBack: boolean
}

/**
 * Hook for managing connection wizard state.
 *
 * Provides a state machine for the multi-step wizard flow with
 * state preservation for back navigation and error recovery.
 *
 * @param initialState - Optional initial state override
 * @returns Wizard state and action dispatchers
 */
export function useWizardState(
  initialState: Partial<WizardState> = {},
): UseWizardStateReturn {
  const [state, dispatch] = useReducer(wizardReducer, {
    ...initialWizardState,
    ...initialState,
  })

  const setAddress = useCallback((address: string) => {
    dispatch({ type: 'SET_ADDRESS', payload: address })
  }, [])

  const setServers = useCallback((servers: Array<RecommendedServerInfo>) => {
    dispatch({ type: 'SET_SERVERS', payload: servers })
  }, [])

  const selectServer = useCallback((server: RecommendedServerInfo) => {
    dispatch({ type: 'SELECT_SERVER', payload: server })
  }, [])

  const setAuthMethod = useCallback((method: AuthMethod) => {
    dispatch({ type: 'SET_AUTH_METHOD', payload: method })
  }, [])

  const setError = useCallback((error: string | null) => {
    dispatch({ type: 'SET_ERROR', payload: error })
  }, [])

  const setLoading = useCallback((loading: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: loading })
  }, [])

  const goToStep = useCallback((step: WizardStep) => {
    dispatch({ type: 'GO_TO_STEP', payload: step })
  }, [])

  const goBack = useCallback(() => {
    dispatch({ type: 'GO_BACK' })
  }, [])

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' })
  }, [])

  const discoverySuccess = useCallback(
    (servers: Array<RecommendedServerInfo>) => {
      dispatch({ type: 'DISCOVERY_SUCCESS', payload: servers })
    },
    [],
  )

  const authSuccess = useCallback(() => {
    dispatch({ type: 'AUTH_SUCCESS' })
  }, [])

  return {
    state,
    setAddress,
    setServers,
    selectServer,
    setAuthMethod,
    setError,
    setLoading,
    goToStep,
    goBack,
    reset,
    discoverySuccess,
    authSuccess,
    canGoBack: canGoBack(state.step),
  }
}
