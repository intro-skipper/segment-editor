import { useRef } from 'react'
import type { RefObject } from 'react'

import { StepIndicator } from './StepIndicator'
import { AuthStep } from './steps/AuthStep'
import { EntryStep } from './steps/EntryStep'
import { SelectStep } from './steps/SelectStep'
import { SuccessStep } from './steps/SuccessStep'
import { useConnectionWizardController } from './use-connection-wizard-controller'
import type { ConnectionWizardProps } from './ConnectionWizard'
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'

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
          isLoading={controller.isRequestPending}
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
          isLoading={controller.isRequestPending}
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
          isLoading={controller.isRequestPending}
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

export function ConnectionWizardContent({
  open,
  onOpenChange,
  onComplete,
}: ConnectionWizardProps) {
  const serverAddressInputRef = useRef<HTMLInputElement>(null)

  const controller = useConnectionWizardController()

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      controller.reset()
    }
    onOpenChange(newOpen)
  }

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
        <DialogTitle className="sr-only">Connect to Jellyfin</DialogTitle>
        <DialogDescription id="wizard-description" className="sr-only">
          Connection wizard to set up your Jellyfin server
        </DialogDescription>

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
