/**
 * EmptyState - Elegant empty state component for when no data is available.
 * Features subtle animation and contextual messaging.
 *
 * Two variants available:
 * - EmptyState: Full-featured with icon, title, description, and action
 * - SimpleEmptyState: Lightweight with just icon and message (re-exported in async-state.tsx)
 */
import { cn } from '@/lib/utils'

/**
 * SimpleEmptyState - Lightweight empty state with icon and message.
 * Used in async-state.tsx for consistency across loading/error/empty states.
 */
interface SimpleEmptyStateProps {
  /** Icon to display */
  icon?: React.ReactNode
  /** Message to display */
  message: string
  /** Additional classes */
  className?: string
}

export function SimpleEmptyState({
  icon,
  message,
  className,
}: SimpleEmptyStateProps) {
  return (
    <div
      className={cn(
        'py-12 flex flex-col items-center justify-center gap-4 text-center text-muted-foreground',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      {icon && (
        <div className="opacity-40" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="text-lg">{message}</p>
    </div>
  )
}
