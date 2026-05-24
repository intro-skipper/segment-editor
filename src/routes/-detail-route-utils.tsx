import { notFound } from '@tanstack/react-router'

import { RouteErrorFallback } from '@/components/ui/route-error-fallback'
import { getCredentials } from '@/services/jellyfin'
import { sanitizeUrl } from '@/services/jellyfin/security'
import { AppError } from '@/lib/unified-error'

export function assertJellyfinCredentials(): void {
  const { serverAddress, accessToken } = getCredentials()

  if (!sanitizeUrl(serverAddress) || !accessToken.trim()) {
    throw AppError.validation('Jellyfin connection is not configured')
  }
}

export function assertItemFound<T>(
  item: T | null,
  signal: AbortSignal,
): asserts item is T {
  if (item !== null) return

  if (signal.aborted) {
    throw AppError.validation('Request was cancelled')
  }

  throw notFound()
}

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
