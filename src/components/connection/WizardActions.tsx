/**
 * WizardActions Component
 *
 * Shared action buttons for wizard steps (back/continue pattern).
 *
 * @module components/connection/WizardActions
 */

import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface WizardActionsProps {
  children: ReactNode
}

/**
 * Layout container for wizard action buttons.
 */
export function WizardActions({ children }: WizardActionsProps) {
  return <div className="flex gap-3">{children}</div>
}

interface WizardBackActionProps {
  onBack: () => void
  disabled?: boolean
}

/** Back button variant for wizard flows. */
export function WizardBackAction({
  onBack,
  disabled = false,
}: WizardBackActionProps) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onBack}
      disabled={disabled}
      className="flex-1"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Back
    </Button>
  )
}

interface WizardContinueActionProps {
  onContinue: () => void
  disabled?: boolean
}

/** Continue button variant for intermediate wizard steps. */
export function WizardContinueAction({
  onContinue,
  disabled = false,
}: WizardContinueActionProps) {
  return (
    <Button
      type="button"
      onClick={onContinue}
      disabled={disabled}
      className="flex-1"
    >
      Continue
      <ArrowRight className="size-4" aria-hidden />
    </Button>
  )
}

interface WizardSubmitActionProps {
  isLoading?: boolean
  label?: string
  loadingLabel?: string
}

/** Submit button variant with built-in loading state. */
export function WizardSubmitAction({
  isLoading = false,
  label = 'Continue',
  loadingLabel,
}: WizardSubmitActionProps) {
  const submitLabel = isLoading ? (loadingLabel ?? label) : label

  return (
    <Button type="submit" disabled={isLoading} className="flex-1">
      {isLoading && (
        <div className="animate-spin" aria-hidden>
          <Loader2 className="size-4" />
        </div>
      )}
      {submitLabel}
    </Button>
  )
}
