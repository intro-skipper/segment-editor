import { Skeleton } from './skeleton'
import { cn } from '@/lib/utils'
import { staggerDelay, STAGGER_SLOW } from '@/lib/animation-utils'

interface SegmentLoadingStateProps {
  count?: number
  className?: string
}

export function SegmentLoadingState({
  count = 3,
  className,
}: SegmentLoadingStateProps) {
  return (
    <output
      className={cn('space-y-3', className)}
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
          style={{ animationDelay: staggerDelay(i, STAGGER_SLOW) }}
        >
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="h-6 w-20 rounded-full" />
            <div className="flex gap-2">
              <Skeleton className="size-8 rounded-lg" />
              <Skeleton className="size-8 rounded-lg" />
            </div>
          </div>
          <Skeleton className="h-10 w-full rounded-lg mb-3" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-24 rounded-md" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        </div>
      ))}
    </output>
  )
}
