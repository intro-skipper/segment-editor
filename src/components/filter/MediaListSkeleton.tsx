import { Skeleton } from '@/components/ui/skeleton'
import { staggerDelay, STAGGER_FAST } from '@/lib/animation-utils'

const LIST_SKELETON_CLASS = 'flex flex-col gap-3'

interface MediaListSkeletonProps {
  count: number
  loadingLabel: string
}

/** Placeholder rows with the same box as MediaListRow, so loading does not shift layout. */
export function MediaListSkeleton({
  count,
  loadingLabel,
}: MediaListSkeletonProps) {
  return (
    <output className={LIST_SKELETON_CLASS} aria-live="polite" aria-busy="true">
      <span className="sr-only">{loadingLabel}</span>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 md:gap-4 p-2.5 md:p-3 rounded-2xl bg-card border border-border/50 animate-in fade-in animation-duration-300"
          style={{ animationDelay: staggerDelay(i, STAGGER_FAST) }}
          aria-hidden="true"
        >
          <Skeleton className="w-12 md:w-14 aspect-2/3 rounded-lg shrink-0" />
          <div className="flex-grow min-w-0 space-y-2">
            <Skeleton className="h-4 md:h-5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </output>
  )
}
