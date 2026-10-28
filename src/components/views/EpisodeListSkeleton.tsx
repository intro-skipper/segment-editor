import { Skeleton } from '@/components/ui/skeleton'

/** Placeholder rows in the shape of SeriesView's episode cards, so loading a season fills in place. */
export function EpisodeListSkeleton() {
  return (
    <div className="flex flex-col gap-2 md:gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-fluid-sm p-3 rounded-2xl border border-border/50 bg-card"
        >
          <Skeleton className="size-episode-thumb shrink-0 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2 py-0.5 md:py-1">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}
