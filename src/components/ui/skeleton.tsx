import { cn } from '@/lib/utils'

/**
 * Static muted block that stands in for loading content. Callers set its size
 * and match its radius to the element it replaces.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-md bg-muted dark:bg-muted/50', className)}
      aria-hidden="true"
      {...props}
    />
  )
}

export { Skeleton }
