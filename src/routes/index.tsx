/**
 * Index route - Main entry point for the application.
 * Renders the FilterView for browsing media collections.
 * Requirements: 2.1
 */

import { createFileRoute } from '@tanstack/react-router'

import { FilterView } from '@/components/filter/FilterView'

export const Route = createFileRoute('/')({
  component: IndexPage,
})

function IndexPage() {
  return (
    <main className="h-[calc(100vh-3.5rem)]">
      <FilterView />
    </main>
  )
}
