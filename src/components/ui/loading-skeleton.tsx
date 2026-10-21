/**
 * Media grid skeletons for async media content, laid out with the same
 * grid-cols-media columns as the media grid they stand in for.
 */

import { staggerDelay, STAGGER_FAST } from '@/lib/animation-utils'
import { cn } from '@/lib/utils'
import { Skeleton } from './skeleton'

function MediaCardSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <Skeleton className="aspect-2/3 w-full rounded-2xl" />
      <div className="flex flex-col gap-2 px-1">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  )
}

/** Grid of skeleton cards for media loading states */
export function MediaGridSkeleton({
  count = 12,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <output
      className={cn('grid grid-cols-media gap-fluid-md', className)}
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading media items</span>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-in fade-in animation-duration-300"
          style={{ animationDelay: staggerDelay(i, STAGGER_FAST) }}
        >
          <MediaCardSkeleton />
        </div>
      ))}
    </output>
  )
}
