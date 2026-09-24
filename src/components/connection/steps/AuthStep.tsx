/**
 * AuthStep Component
 *
 * Third step of the connection wizard - authentication.
 * Supports API Key and Username/Password methods.
 *
 * @module components/connection/steps/AuthStep
 */

import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Key, User } from 'lucide-react'
import { useStore } from '@tanstack/react-form'

import { WizardError } from '../WizardError'
import {
  WizardActions,
  WizardBackAction,
  WizardSubmitAction,
} from '../WizardActions'
import type { useConnectionWizardController } from '../use-connection-wizard-controller'
import { getFirstValidationMessage } from '@/lib/forms/form-error-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type ConnectionWizardFormApi = ReturnType<
  typeof useConnectionWizardController
>['form']

const AUTH_METHODS = [
  { method: 'apiKey', icon: Key, label: 'API Key' },
  { method: 'userPass', icon: User, label: 'Username' },
] as const

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AuthStepProps {
  serverAddress: string
  form: ConnectionWizardFormApi
  onSubmit: () => Promise<void>
  onBack: () => void
  isLoading?: boolean
  error?: string | null
  onClearError?: () => void
  onRetry?: () => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function AuthStep({
  serverAddress,
  form,
  onSubmit,
  onBack,
  isLoading = false,
  error = null,
  onClearError,
  onRetry,
}: AuthStepProps) {
  const [showPassword, setShowPassword] = useState(false)
  const apiKeyInputRef = useRef<HTMLInputElement>(null)
  const usernameInputRef = useRef<HTMLInputElement>(null)
  const authMethod = useStore(form.store, (state) => state.values.authMethod)
  const fieldMeta = useStore(form.store, (state) => state.fieldMeta)

  const activeFieldError =
    authMethod === 'apiKey'
      ? getFirstValidationMessage(fieldMeta.apiKey?.errors)
      : (getFirstValidationMessage(fieldMeta.username?.errors) ??
        getFirstValidationMessage(fieldMeta.password?.errors))

  useEffect(() => {
    if (authMethod === 'apiKey') {
      apiKeyInputRef.current?.focus()
    } else {
      usernameInputRef.current?.focus()
    }
  }, [authMethod])

  const displayError = activeFieldError ?? error
  const handleSubmitAction = async () => {
    await onSubmit()
  }

  return (
    <form action={handleSubmitAction} className="space-y-6">
      {/* Server Address Display */}
      <div className="text-center pb-2">
        <p className="text-sm text-muted-foreground">Connecting to</p>
        <p className="font-medium truncate">{serverAddress}</p>
      </div>

      {/* Auth Method Toggle */}
      <div className="flex gap-2">
        {AUTH_METHODS.map(({ method, icon: Icon, label }) => (
          <Button
            key={method}
            type="button"
            variant={authMethod === method ? 'default' : 'secondary'}
            className="flex-1"
            onClick={() => {
              form.setFieldValue('authMethod', method, { dontValidate: true })
              onClearError?.()
            }}
            aria-pressed={authMethod === method}
          >
            <Icon aria-hidden />
            {label}
          </Button>
        ))}
      </div>

      {/* Form Fields */}
      <div className="space-y-4">
        {authMethod === 'apiKey' ? (
          <form.Field name="apiKey">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="api-key">API Key</Label>
                <Input
                  ref={apiKeyInputRef}
                  id="api-key"
                  name="api-key"
                  type="password"
                  spellCheck={false}
                  placeholder="Enter your API key…"
                  value={String(field.state.value)}
                  onChange={(e) => {
                    field.handleChange(e.target.value)
                    onClearError?.()
                  }}
                  onBlur={field.handleBlur}
                  disabled={isLoading}
                  aria-invalid={!!displayError}
                  aria-describedby={displayError ? 'auth-error' : undefined}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Find your API key in Jellyfin Dashboard → API Keys
                </p>
              </div>
            )}
          </form.Field>
        ) : (
          <>
            <form.Field name="username">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    ref={usernameInputRef}
                    id="username"
                    name="username"
                    type="text"
                    placeholder="Enter your username…"
                    value={String(field.state.value)}
                    onChange={(e) => {
                      field.handleChange(e.target.value)
                      onClearError?.()
                    }}
                    onBlur={field.handleBlur}
                    disabled={isLoading}
                    aria-invalid={!!displayError}
                    spellCheck={false}
                    autoComplete="username"
                  />
                </div>
              )}
            </form.Field>
            <form.Field name="password">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password…"
                      value={String(field.state.value)}
                      onChange={(e) => {
                        field.handleChange(e.target.value)
                        onClearError?.()
                      }}
                      onBlur={field.handleBlur}
                      disabled={isLoading}
                      aria-invalid={!!displayError}
                      aria-describedby={displayError ? 'auth-error' : undefined}
                      autoComplete="current-password"
                      spellCheck={false}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost-muted"
                      size="icon-sm"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-0.5 top-1/2 -translate-y-1/2"
                      aria-label={
                        showPassword ? 'Hide password' : 'Show password'
                      }
                      disabled={isLoading}
                    >
                      {showPassword ? (
                        <EyeOff aria-hidden />
                      ) : (
                        <Eye aria-hidden />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Leave empty if your account has no password
                  </p>
                </div>
              )}
            </form.Field>
          </>
        )}
      </div>

      {/* Error Display */}
      {displayError && (
        <div id="auth-error">
          <WizardError
            message={displayError}
            onRetry={!activeFieldError ? onRetry : undefined}
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
