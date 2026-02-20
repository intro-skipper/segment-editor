/**
 * Index route - Main entry point for the application.
 * Renders the FilterView for browsing media collections.
 *
 * URL search params:
 * - collection: Selected collection ID (nullable)
 * - page: Current page number (defaults to 1)
 * - search: Search filter string (nullable)
 */

import { Suspense, lazy } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { FeatureErrorBoundary } from '@/components/ui/feature-error-boundary'
import { MediaGridSkeleton } from '@/components/ui/loading-skeleton'

const FilterView = lazy(() =>
  import('@/components/filter/FilterView').then((module) => ({
    default: module.FilterView,
  })),
)

/** URL search params schema for the index route */
const indexSearchSchema = z.object({
  collection: z.string().optional().catch(undefined),
  page: z.coerce.number().positive().int().optional().catch(1),
  search: z.string().optional().catch(undefined),
})

/**
 * Loading skeleton for the index page.
 * Uses consistent height variables and ARIA attributes.
 */
function IndexSkeleton() {
  return (
    <main
      className="min-h-[var(--spacing-page-min-height-md)] px-4 pb-8 sm:px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading media library</span>
      <div className="max-w-7xl mx-auto">
        <MediaGridSkeleton count={12} />
      </div>
    </main>
  )
}

export const Route = createFileRoute('/')({
  component: IndexPage,
  validateSearch: indexSearchSchema,
  pendingComponent: IndexSkeleton,
})

function IndexPage() {
  return (
    <main className="min-h-[var(--spacing-page-min-height-md)]">
      <FeatureErrorBoundary
        featureName="Media Browser"
        minHeightClass="min-h-[var(--spacing-page-min-height-md)]"
        showNavigation={false}
      >
        <Suspense fallback={<IndexSkeleton />}>
          <FilterView />
        </Suspense>
      </FeatureErrorBoundary>
    </main>
  )
}
