import { RouteErrorFallback } from '@/components/ui/route-error-fallback'

export function DetailRouteErrorComponent({
  error,
}: {
  error: Error
}): React.ReactNode {
  return (
    <RouteErrorFallback
      message={error.message}
      minHeightClass="min-h-[var(--spacing-page-min-height-header)]"
    />
  )
}
