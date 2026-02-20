/**
 * WizardError Component
 *
 * User-friendly error display with retry functionality.
 * Provides contextual suggestions based on error type.
 *
 * @module components/connection/WizardError
 */

import { AlertCircle, Loader2, RefreshCw, WifiOff } from 'lucide-react'
import { getErrorSuggestion, isNetworkRelatedError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface WizardErrorProps {
  /** Error message to display */
  message: string
  /** Callback when retry is clicked */
  onRetry?: () => void
  /** Whether retry is in progress */
  isRetrying?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * User-friendly error display with retry functionality.
 * Automatically detects network errors and provides contextual suggestions.
 */
export function WizardError({
  message,
  onRetry,
  isRetrying = false,
}: WizardErrorProps) {
  const isNetwork = isNetworkRelatedError(message)
  const Icon = isNetwork ? WifiOff : AlertCircle
  const suggestion = getErrorSuggestion(message)

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-col items-center text-center p-4 rounded-xl bg-destructive/10 border border-destructive/20"
    >
      <div className="size-10 rounded-full bg-destructive/15 flex items-center justify-center mb-3">
        <Icon className="size-5 text-destructive" aria-hidden />
      </div>

      <p className="font-medium text-destructive mb-1">{message}</p>
      <p className="text-sm text-muted-foreground mb-4">{suggestion}</p>

      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          disabled={isRetrying}
          className="gap-2"
        >
          {isRetrying ? (
            <>
              <div className="animate-spin" aria-hidden>
                <Loader2 className="size-4" />
              </div>
              Retrying...
            </>
          ) : (
            <>
              <RefreshCw className="size-4" aria-hidden />
              Try Again
            </>
          )}
        </Button>
      )}
    </div>
  )
}
