/**
 * LoadingSkeleton - Shimmer loading placeholder for async content.
 * Uses CSS animation for smooth, performant loading states.
 *
 * Responsive breakpoints align with VIEWPORT_BREAKPOINTS constants:
 * - sm: 640px (3 columns)
 * - md: 768px (4 columns)
 * - lg: 1024px (5 columns)
 * - xl: 1280px (6 columns)
 */

import { cn } from '@/lib/utils'

export interface LoadingSkeletonProps {
  /** Width of the skeleton */
  width?: string | number
  /** Height of the skeleton */
  height?: string | number
  /** Whether to use rounded corners */
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full'
  /** Additional CSS classes */
  className?: string
}

const roundedMap = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
} as const

export function LoadingSkeleton({
  width,
  height,
  rounded = 'md',
  className,
}: LoadingSkeletonProps) {
  return (
    <div
      className={cn('skeleton-shimmer', roundedMap[rounded], className)}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
      aria-hidden="true"
    />
  )
}

/** Single media card skeleton for loading states */
export function MediaCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)} aria-hidden="true">
      <LoadingSkeleton className="aspect-[2/3] w-full" rounded="lg" />
      <div className="space-y-2 px-1">
        <LoadingSkeleton height={16} className="w-3/4" />
        <LoadingSkeleton height={12} className="w-1/2" />
      </div>
    </div>
  )
}

/** Grid of skeleton cards for media loading states */
export function MediaGridSkeleton({
  count = 12,
  className,
  gridClassName,
}: {
  count?: number
  className?: string
  /** Custom grid class - defaults to responsive 2-6 column grid */
  gridClassName?: string
}) {
  return (
    <div
      className={cn(
        gridClassName ??
          'grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading media items</span>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-in fade-in duration-300"
          style={{ animationDelay: `${i * 30}ms` }}
        >
          <MediaCardSkeleton />
        </div>
      ))}
    </div>
  )
}

/** Skeleton for segment list items */
export function SegmentListSkeleton({
  count = 4,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <div
      className={cn('space-y-3', className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading segments</span>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'flex items-center gap-4 p-3 rounded-lg border border-border/50',
            'animate-in fade-in duration-300',
          )}
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <LoadingSkeleton width={12} height={12} rounded="full" />
          <div className="flex-1 space-y-2">
            <LoadingSkeleton height={14} className="w-24" />
            <LoadingSkeleton height={12} className="w-32" />
          </div>
          <LoadingSkeleton width={60} height={24} rounded="md" />
        </div>
      ))}
    </div>
  )
}

export default LoadingSkeleton
