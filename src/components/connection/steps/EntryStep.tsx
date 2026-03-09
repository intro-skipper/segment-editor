/**
 * EntryStep Component
 *
 * First step of the connection wizard - server address entry.
 *
 * @module components/connection/steps/EntryStep
 */

import { useCallback } from 'react'
import { Loader2, Search, Server } from 'lucide-react'

import { WizardError } from '../WizardError'
import type { RefObject } from 'react'
import type { useConnectionWizardController } from '../use-connection-wizard-controller'
import { getFirstValidationMessage } from '@/lib/forms/form-error-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type ConnectionWizardFormApi = ReturnType<
  typeof useConnectionWizardController
>['form']

interface EntryStepProps {
  form: ConnectionWizardFormApi
  error: string | null
  isLoading: boolean
  onClearError?: () => void
  onDiscover: () => Promise<void>
  onRetry?: () => void
  /** Ref forwarded to the server address input for dialog initialFocus */
  inputRef?: RefObject<HTMLInputElement | null>
}

export function EntryStep({
  form,
  error,
  isLoading,
  onClearError,
  onDiscover,
  onRetry,
  inputRef,
}: EntryStepProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !isLoading) {
        e.preventDefault()
        void onDiscover()
      }
    },
    [isLoading, onDiscover],
  )

  return (
    <form.Field name="address">
      {(field) => {
        const address = String(field.state.value)
        const fieldError = getFirstValidationMessage(field.state.meta.errors)
        const displayError = fieldError ?? error

        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="size-12 rounded-xl bg-primary/15 flex items-center justify-center mx-auto mb-4">
                <Server className="size-6 text-primary" aria-hidden />
              </div>
              <h2 className="text-lg font-semibold mb-1">
                Connect to Jellyfin
              </h2>
              <p className="text-sm text-muted-foreground">
                Enter your server address to get started
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="server-address">Server Address</Label>
              <Input
                ref={inputRef}
                id="server-address"
                type="text"
                inputMode="url"
                placeholder="jellyfin.example.com"
                value={address}
                onChange={(e) => {
                  field.handleChange(e.target.value)
                  onClearError?.()
                }}
                onBlur={field.handleBlur}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                aria-invalid={!!displayError}
                aria-describedby={
                  displayError ? 'address-error' : 'address-hint'
                }
              />
              <p id="address-hint" className="text-xs text-muted-foreground">
                Enter hostname or IP address. Protocol and port are
                auto-detected.
              </p>
            </div>

            {displayError && (
              <div id="address-error">
                <WizardError
                  message={displayError}
                  onRetry={!fieldError && address.trim() ? onRetry : undefined}
                  isRetrying={isLoading}
                />
              </div>
            )}

            <Button
              type="button"
              onClick={() => void onDiscover()}
              disabled={isLoading || !address.trim()}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin" aria-hidden>
                    <Loader2 className="size-4" />
                  </div>
                  Discovering...
                </>
              ) : (
                <>
                  <Search className="size-4" aria-hidden />
                  Find Server
                </>
              )}
            </Button>
          </div>
        )
      }}
    </form.Field>
  )
}
