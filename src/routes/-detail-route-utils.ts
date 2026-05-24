import { notFound } from '@tanstack/react-router'

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
