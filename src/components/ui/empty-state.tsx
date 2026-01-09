/**
 * EmptyState - Elegant empty state component for when no data is available.
 * Features subtle animation and contextual messaging.
 *
 * Two variants available:
 * - EmptyState: Full-featured with icon, title, description, and action
 * - SimpleEmptyState: Lightweight with just icon and message (re-exported in async-state.tsx)
 */

import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  /** Icon to display */
  icon?: LucideIcon
  /** Main title text */
  title: string
  /** Description text */
  description?: string
  /** Optional action button */
  action?: React.ReactNode
  /** Additional CSS classes */
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        'min-h-[var(--spacing-empty-state-min-height)] p-8',
        'animate-in fade-in-50 duration-500',
        className,
      )}
    >
      {Icon && (
        <div className="relative mb-6">
          {/* Subtle glow effect behind icon */}
          <div
            className="absolute inset-0 blur-2xl opacity-20 rounded-full"
            style={{ background: 'var(--primary)' }}
          />
          <div
            className={cn(
              'relative p-4 rounded-2xl',
              'bg-muted/50 border border-border/50',
              'empty-state-illustration',
            )}
          >
            <Icon className="size-12 text-muted-foreground" strokeWidth={1.5} />
          </div>
        </div>
      )}

      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>

      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mb-6">
          {description}
        </p>
      )}

      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/**
 * SimpleEmptyState - Lightweight empty state with icon and message.
 * Used in async-state.tsx for consistency across loading/error/empty states.
 */
export interface SimpleEmptyStateProps {
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

export default EmptyState
