import type { ErrorComponentProps } from '@tanstack/react-router'

import { RouteErrorFallback } from '@/components/ui/route-error-fallback'

export function DetailRouteErrorComponent({
  error,
}: ErrorComponentProps): React.ReactNode {
  return (
    <RouteErrorFallback
      message={error instanceof Error ? error.message : undefined}
      minHeightClass="min-h-[var(--spacing-page-min-height-header)]"
    />
  )
}
