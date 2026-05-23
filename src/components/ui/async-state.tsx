/**
 * AsyncState - Reusable loading, error, and empty state components.
 * Consolidates duplicated patterns across views.
 *
 * LoadingState includes proper ARIA attributes for accessibility.
 */

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoadingStateProps {
  /** Loading message to display */
  message?: string
  /** Additional classes */
  className?: string
  /** Size of the spinner */
  size?: 'sm' | 'md' | 'lg'
}

const spinnerSizes = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-6',
} as const

/**
 * Centered loading spinner with optional message.
 * Use for inline loading states within components.
 */
export function LoadingState({
  message,
  className,
  size = 'sm',
}: LoadingStateProps) {
  return (
    <output
      className={cn(
        'py-6 flex items-center justify-center gap-2 text-muted-foreground',
        className,
      )}
      aria-live="polite"
      aria-busy="true"
    >
      <div className="animate-spin" aria-hidden="true">
        <Loader2 className={cn(spinnerSizes[size])} />
      </div>
      <span className="sr-only">Loading</span>
      {message && <span>{message}</span>}
    </output>
  )
}
