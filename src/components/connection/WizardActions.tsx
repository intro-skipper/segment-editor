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
  label?: string
}

/** Back button variant for wizard flows. */
export function WizardBackAction({
  onBack,
  disabled = false,
  label = 'Back',
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
      {label}
    </Button>
  )
}

interface WizardContinueActionProps {
  onContinue: () => void
  disabled?: boolean
  label?: string
}

/** Continue button variant for intermediate wizard steps. */
export function WizardContinueAction({
  onContinue,
  disabled = false,
  label = 'Continue',
}: WizardContinueActionProps) {
  return (
    <Button
      type="button"
      onClick={onContinue}
      disabled={disabled}
      className="flex-1"
    >
      {label}
      <ArrowRight className="size-4" aria-hidden />
    </Button>
  )
}

interface WizardSubmitActionProps {
  isLoading?: boolean
  disabled?: boolean
  label?: string
  loadingLabel?: string
}

/** Submit button variant with built-in loading state. */
export function WizardSubmitAction({
  isLoading = false,
  disabled = false,
  label = 'Continue',
  loadingLabel,
}: WizardSubmitActionProps) {
  const submitLabel = isLoading ? (loadingLabel ?? label) : label

  return (
    <Button type="submit" disabled={disabled || isLoading} className="flex-1">
      {isLoading && (
        <div className="animate-spin" aria-hidden>
          <Loader2 className="size-4" />
        </div>
      )}
      {submitLabel}
    </Button>
  )
}
