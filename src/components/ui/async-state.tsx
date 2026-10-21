/**
 * AsyncState - Reusable loading state component.
 *
 * LoadingState includes proper ARIA attributes for accessibility.
 */

import { Loader } from 'lucide-react'

interface LoadingStateProps {
  /** Loading message to display */
  message?: string
}

/**
 * Centered loading indicator with optional message.
 * Use for inline loading states within components.
 */
export function LoadingState({ message }: LoadingStateProps) {
  return (
    <output
      className="py-6 flex items-center justify-center gap-2 text-muted-foreground"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader className="size-4" aria-hidden="true" />
      <span className="sr-only">Loading</span>
      {message && <span>{message}</span>}
    </output>
  )
}
