/**
 * WizardError Component
 *
 * User-friendly error display with retry functionality.
 * Provides contextual suggestions based on error type.
 *
 * @module components/connection/WizardError
 */

import { AlertCircle, Loader, RefreshCw, WifiOff } from 'lucide-react'
import { getErrorSuggestion, isNetworkRelatedError } from '@/lib/error-utils'
import { Button } from '@/components/ui/button'
import { IconDisc } from '@/components/ui/icon-disc'

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
      <IconDisc tone="destructive" className="mbe-3">
        <Icon />
      </IconDisc>

      <p className="font-medium text-destructive mbe-1 break-words">
        {message}
      </p>
      <p className="text-sm text-muted-foreground mbe-4">{suggestion}</p>

      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          disabled={isRetrying}
        >
          {isRetrying ? (
            <>
              <Loader className="size-4" aria-hidden />
              Retrying…
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
