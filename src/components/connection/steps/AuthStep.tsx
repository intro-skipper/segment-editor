/**
 * AuthStep Component
 *
 * Third step of the connection wizard - authentication.
 * Supports API Key and Username/Password methods.
 *
 * @module components/connection/steps/AuthStep
 */

import { useCallback, useEffect, useReducer, useRef } from 'react'
import { Eye, EyeOff, Key, User } from 'lucide-react'

import { WizardError } from '../WizardError'
import {
  WizardActions,
  WizardBackAction,
  WizardSubmitAction,
} from '../WizardActions'
import type { AuthMethod } from '@/stores/api-store'
import type { AuthCredentials as Credentials } from '@/services/jellyfin'
import { validateCredentials } from '@/services/jellyfin'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AuthStepProps {
  serverAddress: string
  onSubmit: (credentials: Credentials) => void
  onBack: () => void
  isLoading?: boolean
  error?: string | null
  authMethod: AuthMethod
  onAuthMethodChange: (method: AuthMethod) => void
  onRetry?: () => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildCredentials(
  authMethod: AuthMethod,
  apiKey: string,
  username: string,
  password: string,
): Credentials {
  return authMethod === 'apiKey'
    ? { method: 'apiKey', apiKey }
    : { method: 'userPass', username, password }
}

interface AuthStepState {
  apiKey: string
  username: string
  password: string
  showPassword: boolean
  validationError: string | null
  lastSubmittedCredentials: Credentials | null
}

type AuthStepAction =
  | { type: 'SET_API_KEY'; value: string }
  | { type: 'SET_USERNAME'; value: string }
  | { type: 'SET_PASSWORD'; value: string }
  | { type: 'TOGGLE_SHOW_PASSWORD' }
  | { type: 'SET_VALIDATION_ERROR'; value: string | null }
  | { type: 'SET_LAST_SUBMITTED'; value: Credentials | null }

const initialState: AuthStepState = {
  apiKey: '',
  username: '',
  password: '',
  showPassword: false,
  validationError: null,
  lastSubmittedCredentials: null,
}

function authStepReducer(state: AuthStepState, action: AuthStepAction) {
  switch (action.type) {
    case 'SET_API_KEY':
      return {
        ...state,
        apiKey: action.value,
        validationError: null,
      }
    case 'SET_USERNAME':
      return {
        ...state,
        username: action.value,
        validationError: null,
      }
    case 'SET_PASSWORD':
      return {
        ...state,
        password: action.value,
        validationError: null,
      }
    case 'TOGGLE_SHOW_PASSWORD':
      return {
        ...state,
        showPassword: !state.showPassword,
      }
    case 'SET_VALIDATION_ERROR':
      return {
        ...state,
        validationError: action.value,
      }
    case 'SET_LAST_SUBMITTED':
      return {
        ...state,
        lastSubmittedCredentials: action.value,
      }
    default:
      return state
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function AuthStep({
  serverAddress,
  onSubmit,
  onBack,
  isLoading = false,
  error = null,
  authMethod,
  onAuthMethodChange,
  onRetry,
}: AuthStepProps) {
  const [state, dispatch] = useReducer(authStepReducer, initialState)
  const {
    apiKey,
    username,
    password,
    showPassword,
    validationError,
    lastSubmittedCredentials,
  } = state

  const apiKeyInputRef = useRef<HTMLInputElement>(null)
  const usernameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (authMethod === 'apiKey') {
      apiKeyInputRef.current?.focus()
    } else {
      usernameInputRef.current?.focus()
    }
  }, [authMethod])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const credentials = buildCredentials(
        authMethod,
        apiKey,
        username,
        password,
      )
      const validationResult = validateCredentials(credentials)
      if (validationResult) {
        dispatch({ type: 'SET_VALIDATION_ERROR', value: validationResult })
        return
      }
      dispatch({ type: 'SET_LAST_SUBMITTED', value: credentials })
      onSubmit(credentials)
    },
    [authMethod, apiKey, username, password, onSubmit],
  )

  const handleRetry = useCallback(() => {
    if (onRetry) {
      onRetry()
    } else if (lastSubmittedCredentials) {
      onSubmit(lastSubmittedCredentials)
    } else {
      const credentials = buildCredentials(
        authMethod,
        apiKey,
        username,
        password,
      )
      if (!validateCredentials(credentials)) {
        onSubmit(credentials)
      }
    }
  }, [
    onRetry,
    lastSubmittedCredentials,
    onSubmit,
    authMethod,
    apiKey,
    username,
    password,
  ])

  const displayError = validationError ?? error

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Server Address Display */}
      <div className="text-center pb-2">
        <p className="text-sm text-muted-foreground">Connecting to</p>
        <p className="font-medium truncate">{serverAddress}</p>
      </div>

      {/* Auth Method Toggle */}
      <div className="flex rounded-lg bg-muted/60 p-1">
        <button
          type="button"
          onClick={() => {
            onAuthMethodChange('apiKey')
            dispatch({ type: 'SET_VALIDATION_ERROR', value: null })
          }}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-[background-color,color,box-shadow]',
            authMethod === 'apiKey'
              ? 'bg-background shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          aria-pressed={authMethod === 'apiKey'}
        >
          <Key className="size-4" aria-hidden />
          API Key
        </button>
        <button
          type="button"
          onClick={() => {
            onAuthMethodChange('userPass')
            dispatch({ type: 'SET_VALIDATION_ERROR', value: null })
          }}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-[background-color,color,box-shadow]',
            authMethod === 'userPass'
              ? 'bg-background shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          aria-pressed={authMethod === 'userPass'}
        >
          <User className="size-4" aria-hidden />
          Username
        </button>
      </div>

      {/* Form Fields */}
      <div className="space-y-4">
        {authMethod === 'apiKey' ? (
          <div className="space-y-2">
            <Label htmlFor="api-key">API Key</Label>
            <Input
              ref={apiKeyInputRef}
              id="api-key"
              type="password"
              placeholder="Enter your API key"
              value={apiKey}
              onChange={(e) =>
                dispatch({ type: 'SET_API_KEY', value: e.target.value })
              }
              disabled={isLoading}
              aria-invalid={!!displayError}
              aria-describedby={displayError ? 'auth-error' : undefined}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Find your API key in Jellyfin Dashboard → API Keys
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                ref={usernameInputRef}
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) =>
                  dispatch({ type: 'SET_USERNAME', value: e.target.value })
                }
                disabled={isLoading}
                aria-invalid={!!displayError}
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) =>
                    dispatch({ type: 'SET_PASSWORD', value: e.target.value })
                  }
                  disabled={isLoading}
                  aria-invalid={!!displayError}
                  aria-describedby={displayError ? 'auth-error' : undefined}
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'TOGGLE_SHOW_PASSWORD' })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden />
                  ) : (
                    <Eye className="size-4" aria-hidden />
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave empty if your account has no password
              </p>
            </div>
          </>
        )}
      </div>

      {/* Error Display */}
      {displayError && (
        <div id="auth-error">
          <WizardError
            message={displayError}
            onRetry={!validationError ? handleRetry : undefined}
            isRetrying={isLoading}
          />
        </div>
      )}

      {/* Actions */}
      <WizardActions>
        <WizardBackAction onBack={onBack} disabled={isLoading} />
        <WizardSubmitAction
          isLoading={isLoading}
          label="Connect"
          loadingLabel="Connecting…"
        />
      </WizardActions>
    </form>
  )
}
