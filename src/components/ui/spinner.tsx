import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SpinnerProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
  /** Accessible label for screen readers */
  label?: string
}

const sizeClasses = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-8',
}

/**
 * Spinner component for loading indicators.
 * Uses Lucide's Loader2 icon with animation.
 * Includes proper ARIA attributes for accessibility.
 */
function Spinner({ className, size = 'md', label = 'Loading' }: SpinnerProps) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <Loader2
        className={cn(
          'animate-spin text-muted-foreground',
          sizeClasses[size],
          className,
        )}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  )
}

/**
 * Full-page loading component with centered spinner.
 * Use as a fallback for Suspense boundaries.
 * Includes proper ARIA attributes for accessibility.
 */
function PageLoader({ message }: { message?: string }) {
  return (
    <div
      className="flex min-h-[var(--spacing-page-min-height-sm)] items-center justify-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-3">
        <Loader2
          className={cn('animate-spin text-muted-foreground', sizeClasses.lg)}
          aria-hidden="true"
        />
        <span className="sr-only">{message || 'Loading'}</span>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </div>
  )
}

export { Spinner, PageLoader }
