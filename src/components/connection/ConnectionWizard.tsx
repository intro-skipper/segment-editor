/**
 * ConnectionWizard Component
 *
 * Multi-step wizard for server discovery and authentication.
 * Steps: Entry → Select → Auth → Success
 *
 * @module components/connection/ConnectionWizard
 */

import { useCallback, useEffect, useRef } from 'react'

import { useWizardState } from './use-wizard-state'
import { AuthStep, EntryStep, SelectStep, SuccessStep } from './steps'
import { StepIndicator } from './StepIndicator'
import type { RefObject } from 'react'
import type { AuthCredentials as Credentials } from '@/services/jellyfin'
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
} from '@/components/ui/dialog'
import {
  authenticate,
  discoverServers,
  storeAuthResult,
} from '@/services/jellyfin'
import { useAbortController } from '@/hooks/use-abort-controller'
import { withErrorBoundary } from '@/components/with-error-boundary'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ConnectionWizardProps {
  /** Whether the wizard dialog is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** Callback when connection is successfully established */
  onComplete?: () => void
}

interface WizardStepContentProps {
  state: ReturnType<typeof useWizardState>['state']
  setAddress: ReturnType<typeof useWizardState>['setAddress']
  setAuthMethod: ReturnType<typeof useWizardState>['setAuthMethod']
  handleDiscover: () => void
  handleServerSelect: (
    server: ReturnType<typeof useWizardState>['state']['selectedServer'],
  ) => void
  goBack: ReturnType<typeof useWizardState>['goBack']
  handleProceedToAuth: () => void
  handleAuthenticate: (credentials: Credentials) => void
  handleComplete: () => void
  serverAddressInputRef: RefObject<HTMLInputElement | null>
}

function WizardStepContent({
  state,
  setAddress,
  setAuthMethod,
  handleDiscover,
  handleServerSelect,
  goBack,
  handleProceedToAuth,
  handleAuthenticate,
  handleComplete,
  serverAddressInputRef,
}: WizardStepContentProps) {
  switch (state.step) {
    case 'entry':
      return (
        <EntryStep
          address={state.address}
          error={state.error}
          isLoading={state.isLoading}
          onAddressChange={setAddress}
          onDiscover={handleDiscover}
          onRetry={handleDiscover}
          inputRef={serverAddressInputRef}
        />
      )

    case 'select':
      return (
        <SelectStep
          servers={state.servers}
          selectedServer={state.selectedServer}
          isLoading={state.isLoading}
          error={state.error}
          onSelect={handleServerSelect}
          onBack={goBack}
          onContinue={handleProceedToAuth}
        />
      )

    case 'auth':
      return (
        <AuthStep
          serverAddress={state.selectedServer?.address ?? ''}
          onSubmit={handleAuthenticate}
          onBack={goBack}
          isLoading={state.isLoading}
          error={state.error}
          authMethod={state.authMethod}
          onAuthMethodChange={setAuthMethod}
        />
      )

    case 'success':
      return (
        <SuccessStep
          selectedServer={state.selectedServer}
          onComplete={handleComplete}
        />
      )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Multi-step wizard for server discovery and authentication.
 */
function ConnectionWizardBase({
  open,
  onOpenChange,
  onComplete,
}: ConnectionWizardProps) {
  const { createController, abort } = useAbortController()

  // Ref for the server address input — passed as initialFocus to the dialog
  // so Base UI focuses it reliably when the wizard opens, without a setTimeout.
  const serverAddressInputRef = useRef<HTMLInputElement>(null)

  const {
    state,
    setAddress,
    selectServer,
    setAuthMethod,
    setError,
    setLoading,
    goToStep,
    goBack,
    reset,
    discoverySuccess,
    authSuccess,
  } = useWizardState()

  // Cancel any in-flight requests when wizard closes
  useEffect(() => {
    if (!open) {
      abort()
    }
  }, [open, abort])

  // Handle dialog close
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        abort()
        reset()
      }
      onOpenChange(newOpen)
    },
    [onOpenChange, reset, abort],
  )

  // Handle server discovery
  const handleDiscover = useCallback(async () => {
    if (!state.address.trim()) {
      setError('Please enter a server address')
      return
    }

    const controller = createController()
    setLoading(true)

    const result = await discoverServers(state.address, {
      signal: controller.signal,
    })

    // Check if cancelled
    if (controller.signal.aborted) return

    if (result.error) {
      setError(result.error)
      return
    }

    if (result.servers.length === 0) {
      setError(
        'No servers found at this address. Check the address and try again.',
      )
      return
    }

    discoverySuccess(result.servers)
  }, [state.address, setError, setLoading, discoverySuccess, createController])

  // Handle server selection and proceed to auth
  const handleServerSelect = useCallback(
    (server: typeof state.selectedServer) => {
      if (server) {
        selectServer(server)
      }
    },
    [selectServer],
  )

  // Handle proceeding to auth step
  const handleProceedToAuth = useCallback(() => {
    if (state.selectedServer) {
      goToStep('auth')
    }
  }, [state.selectedServer, goToStep])

  // Handle authentication
  const handleAuthenticate = useCallback(
    async (credentials: Credentials) => {
      if (!state.selectedServer) return

      const controller = createController()
      setLoading(true)
      setAuthMethod(credentials.method)

      const result = await authenticate(
        state.selectedServer.address,
        credentials,
        {
          signal: controller.signal,
        },
      )

      // Check if cancelled
      if (controller.signal.aborted) return

      if (!result.success) {
        setError(result.error ?? 'Authentication failed')
        return
      }

      // Store credentials
      storeAuthResult(state.selectedServer.address, result, credentials.method)

      authSuccess()
    },
    [
      state.selectedServer,
      setLoading,
      setAuthMethod,
      setError,
      authSuccess,
      createController,
    ],
  )

  // Handle completion
  const handleComplete = useCallback(() => {
    handleOpenChange(false)
    onComplete?.()
  }, [handleOpenChange, onComplete])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md p-6 bg-popover/95 backdrop-blur-xl border-border/50 shadow-2xl"
        aria-describedby="wizard-description"
        initialFocus={serverAddressInputRef}
      >
        {state.step !== 'success' && <DialogCloseButton />}
        <span id="wizard-description" className="sr-only">
          Connection wizard to set up your Jellyfin server
        </span>

        <StepIndicator currentStep={state.step} />

        <WizardStepContent
          state={state}
          setAddress={setAddress}
          setAuthMethod={setAuthMethod}
          handleDiscover={handleDiscover}
          handleServerSelect={handleServerSelect}
          goBack={goBack}
          handleProceedToAuth={handleProceedToAuth}
          handleAuthenticate={handleAuthenticate}
          handleComplete={handleComplete}
          serverAddressInputRef={serverAddressInputRef}
        />
      </DialogContent>
    </Dialog>
  )
}

// Wrap with error boundary for reliability
export const ConnectionWizard = withErrorBoundary(ConnectionWizardBase)
