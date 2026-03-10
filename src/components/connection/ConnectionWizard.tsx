/**
 * ConnectionWizard Component
 *
 * Multi-step wizard for server discovery and authentication.
 * Steps: Entry → Select → Auth → Success
 *
 * @module components/connection/ConnectionWizard
 */

import { useRef } from 'react'

import { AuthStep } from './steps/AuthStep'
import { EntryStep } from './steps/EntryStep'
import { SelectStep } from './steps/SelectStep'
import { SuccessStep } from './steps/SuccessStep'
import { useConnectionWizardController } from './use-connection-wizard-controller'
import { StepIndicator } from './StepIndicator'
import type { RefObject } from 'react'
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
} from '@/components/ui/dialog'
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
  controller: ReturnType<typeof useConnectionWizardController>
  handleComplete: () => void
  serverAddressInputRef: RefObject<HTMLInputElement | null>
}

function WizardStepContent({
  controller,
  handleComplete,
  serverAddressInputRef,
}: WizardStepContentProps) {
  switch (controller.step) {
    case 'entry':
      return (
        <EntryStep
          form={controller.form}
          error={controller.requestError}
          isLoading={controller.isLoading}
          onClearError={controller.clearRequestError}
          onDiscover={controller.handleDiscoverSubmit}
          onRetry={controller.handleRetryDiscovery}
          inputRef={serverAddressInputRef}
        />
      )

    case 'select':
      return (
        <SelectStep
          servers={controller.servers}
          selectedServer={controller.selectedServer}
          isLoading={controller.isLoading}
          error={null}
          onSelect={controller.handleServerSelect}
          onBack={controller.handleBack}
          onContinue={controller.handleProceedToAuth}
        />
      )

    case 'auth':
      return (
        <AuthStep
          serverAddress={controller.selectedServer?.address ?? ''}
          form={controller.form}
          onSubmit={controller.handleAuthSubmit}
          onBack={controller.handleBack}
          isLoading={controller.isLoading}
          error={controller.requestError}
          onClearError={controller.clearRequestError}
          onRetry={controller.handleRetryAuth}
        />
      )

    case 'success':
      return (
        <SuccessStep
          selectedServer={controller.selectedServer}
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
  // Ref for the server address input — passed as initialFocus to the dialog
  // so Base UI focuses it reliably when the wizard opens, without a setTimeout.
  const serverAddressInputRef = useRef<HTMLInputElement>(null)

  const controller = useConnectionWizardController({ open })

  // Handle dialog close
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      controller.reset()
    }
    onOpenChange(newOpen)
  }

  // Handle completion
  const handleComplete = () => {
    handleOpenChange(false)
    onComplete?.()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md p-6 bg-popover/95 backdrop-blur-xl border-border/50 shadow-2xl"
        aria-describedby="wizard-description"
        initialFocus={serverAddressInputRef}
      >
        {controller.step !== 'success' && <DialogCloseButton />}
        <span id="wizard-description" className="sr-only">
          Connection wizard to set up your Jellyfin server
        </span>

        <StepIndicator currentStep={controller.step} />

        <WizardStepContent
          controller={controller}
          handleComplete={handleComplete}
          serverAddressInputRef={serverAddressInputRef}
        />
      </DialogContent>
    </Dialog>
  )
}

// Wrap with error boundary for reliability
export const ConnectionWizard = withErrorBoundary(ConnectionWizardBase)
