/**
 * Media grid skeletons for async media content.
 * Responsive breakpoints align with VIEWPORT_BREAKPOINTS constants:
 * - sm: 640px (3 columns)
 * - md: 768px (4 columns)
 * - lg: 1024px (5 columns)
 * - xl: 1280px (6 columns)
 */

import { staggerDelay, STAGGER_FAST } from '@/lib/animation-utils'
import { cn } from '@/lib/utils'
import { Skeleton } from './skeleton'

function MediaCardSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <Skeleton className="aspect-[2/3] w-full rounded-lg" />
      <div className="space-y-2 px-1">
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
      className={cn(
        'grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
        className,
      )}
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading media items</span>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-in fade-in duration-300"
          style={{ animationDelay: staggerDelay(i, STAGGER_FAST) }}
        >
          <MediaCardSkeleton />
        </div>
      ))}
    </output>
  )
}
