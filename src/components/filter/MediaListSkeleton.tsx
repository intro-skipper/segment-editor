import { staggerDelay, STAGGER_FAST } from '@/lib/animation-utils'

const LIST_SKELETON_CLASS = 'flex flex-col gap-3'

interface MediaListSkeletonProps {
  count: number
  loadingLabel: string
}

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
          className="flex items-center gap-4 p-3 md:p-4 rounded-2xl md:rounded-3xl bg-card/60 backdrop-blur-sm animate-in fade-in duration-300"
          style={{ animationDelay: staggerDelay(i, STAGGER_FAST) }}
          aria-hidden="true"
        >
          <div className="w-16 md:w-20 aspect-[2/3] rounded-xl md:rounded-2xl skeleton-shimmer flex-shrink-0" />
          <div className="flex-grow min-w-0 space-y-2">
            <div className="h-5 md:h-6 w-2/3 rounded-md skeleton-shimmer" />
            <div className="h-4 w-1/3 rounded-md skeleton-shimmer" />
          </div>
        </div>
      ))}
    </output>
  )
}
