/**
 * AsyncState - Reusable loading state component.
 *
 * LoadingState includes proper ARIA attributes for accessibility.
 */

import { Loader2 } from 'lucide-react'

interface LoadingStateProps {
  /** Loading message to display */
  message?: string
}

/**
 * Centered loading spinner with optional message.
 * Use for inline loading states within components.
 */
export function LoadingState({ message }: LoadingStateProps) {
  return (
    <output
      className="py-6 flex items-center justify-center gap-2 text-muted-foreground"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="animate-spin" aria-hidden="true">
        <Loader2 className="size-4" />
      </div>
      <span className="sr-only">Loading</span>
      {message && <span>{message}</span>}
    </output>
  )
}
