/**
 * AsyncState - Reusable loading, error, and empty state components.
 * Consolidates duplicated patterns across views.
 *
 * Loading State Patterns:
 * - LoadingState: Centered spinner with optional message (for inline/small areas)
 * - FullPageLoadingState: Full-page centered spinner (for route-level loading)
 * - SegmentLoadingState: Skeleton cards for segment lists
 *
 * All loading components include proper ARIA attributes for accessibility.
 */

import { AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import { Button } from './button'
import { Skeleton } from './skeleton'
import { cn } from '@/lib/utils'

// Re-export SimpleEmptyState as EmptyState for backward compatibility
export {
  SimpleEmptyState as EmptyState,
  type SimpleEmptyStateProps as EmptyStateProps,
} from './empty-state'

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
    <div
      className={cn(
        'py-6 flex items-center justify-center gap-2 text-muted-foreground',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2
        className={cn(spinnerSizes[size], 'animate-spin')}
        aria-hidden="true"
      />
      <span className="sr-only">Loading</span>
      {message && <span>{message}</span>}
    </div>
  )
}

interface FullPageLoadingStateProps {
  /** Loading message to display */
  message?: string
  /** Minimum height class for the container */
  minHeightClass?: string
}

/**
 * Full-page centered loading spinner.
 * Use for route-level loading states or major feature areas.
 */
export function FullPageLoadingState({
  message,
  minHeightClass = 'min-h-[var(--spacing-page-min-height-sm)]',
}: FullPageLoadingStateProps) {
  return (
    <div
      className={cn('flex items-center justify-center', minHeightClass)}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-3">
        <Loader2
          className="size-8 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
        <span className="sr-only">Loading</span>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </div>
  )
}

interface SegmentLoadingStateProps {
  /** Number of skeleton items to show */
  count?: number
  /** Additional classes */
  className?: string
}

/**
 * Skeleton loading state for segment lists.
 * Displays animated skeleton cards matching segment slider layout.
 */
export function SegmentLoadingState({
  count = 3,
  className,
}: SegmentLoadingStateProps) {
  return (
    <div
      className={cn('space-y-3', className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading segments</span>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'p-4 rounded-2xl border border-border/50 bg-card/30',
            'animate-in fade-in duration-300',
          )}
          style={{ animationDelay: `${i * 50}ms` }}
        >
          {/* Header row with type badge and actions */}
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="h-6 w-20 rounded-full" />
            <div className="flex gap-2">
              <Skeleton className="size-8 rounded-lg" />
              <Skeleton className="size-8 rounded-lg" />
            </div>
          </div>
          {/* Slider track */}
          <Skeleton className="h-10 w-full rounded-lg mb-3" />
          {/* Time inputs row */}
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-24 rounded-md" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  )
}

interface ErrorStateProps {
  /** Error message to display */
  message: string
  /** Callback when retry is clicked */
  onRetry?: () => void
  /** Retry button text */
  retryText?: string
  /** Additional classes */
  className?: string
}

/**
 * Error display with optional retry button.
 */
export function ErrorState({
  message,
  onRetry,
  retryText = 'Retry',
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'py-6 flex flex-col items-center justify-center gap-3 text-muted-foreground',
        className,
      )}
      role="alert"
      aria-live="assertive"
    >
      <AlertCircle className="size-8 text-destructive" aria-hidden="true" />
      <p className="text-sm">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="size-4 mr-2" aria-hidden="true" />
          {retryText}
        </Button>
      )}
    </div>
  )
}
