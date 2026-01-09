/**
 * WizardActions Component
 *
 * Shared action buttons for wizard steps (back/continue pattern).
 *
 * @module components/connection/WizardActions
 */

import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface WizardActionsProps {
  /** Callback when back button is clicked */
  onBack?: () => void
  /** Callback when continue/submit button is clicked */
  onContinue?: () => void
  /** Whether to disable all buttons */
  isLoading?: boolean
  /** Whether continue button should be disabled */
  continueDisabled?: boolean
  /** Back button label */
  backLabel?: string
  /** Continue button label */
  continueLabel?: string
  /** Loading state label */
  loadingLabel?: string
  /** Whether to show loading spinner on continue */
  showLoadingSpinner?: boolean
  /** Button type for continue (for form submission) */
  continueType?: 'button' | 'submit'
}

/**
 * Consistent action buttons for wizard navigation.
 */
export function WizardActions({
  onBack,
  onContinue,
  isLoading = false,
  continueDisabled = false,
  backLabel = 'Back',
  continueLabel = 'Continue',
  loadingLabel,
  showLoadingSpinner = false,
  continueType = 'button',
}: WizardActionsProps) {
  const showSpinner = showLoadingSpinner && isLoading

  return (
    <div className="flex gap-3">
      {onBack && (
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={isLoading}
          className="flex-1"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {backLabel}
        </Button>
      )}
      <Button
        type={continueType}
        onClick={continueType === 'button' ? onContinue : undefined}
        disabled={continueDisabled || isLoading}
        className="flex-1"
      >
        {showSpinner ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {loadingLabel ?? continueLabel}
          </>
        ) : (
          <>
            {continueLabel}
            {onBack && <ArrowRight className="size-4" aria-hidden />}
          </>
        )}
      </Button>
    </div>
  )
}
