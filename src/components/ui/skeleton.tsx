import { cn } from '@/lib/utils'

/**
 * Skeleton component for loading placeholders.
 * Displays an animated pulse effect to indicate loading content.
 * Supports both light and dark modes with appropriate contrast.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-muted dark:bg-muted/50',
        className,
      )}
      aria-hidden="true"
      {...props}
    />
  )
}

export { Skeleton }
