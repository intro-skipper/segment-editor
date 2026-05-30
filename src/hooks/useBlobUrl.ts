/**
 * Hook to fetch an image URL and convert it to a blob URL.
 * This works around COEP restrictions when the server doesn't provide
 * Cross-Origin-Resource-Policy headers.
 *
 * Uses the shared blobCache and fetchBlobUrl for consistency with useVibrantColor.
 */

import { useEffect, useState } from 'react'
import { blobCache, fetchBlobUrl } from '@/lib/cache-manager'

/**
 * Fetches an image URL and returns a blob URL that bypasses COEP restrictions.
 * @param url - The image URL to fetch
 * @returns The blob URL, or empty string if not yet loaded or failed
 */
export function useBlobUrl(url: string | null | undefined): string {
  // Track only the async-fetched result; cache reads are derived during render.
  const [pending, setPending] = useState<{ for: string; blob: string } | null>(
    null,
  )

  useEffect(() => {
    if (!url || blobCache.has(url)) return

    let cancelled = false
    void fetchBlobUrl(url).then((result) => {
      if (!cancelled && result) {
        setPending({ for: url, blob: result })
      }
    })
    return () => {
      cancelled = true
    }
  }, [url])

  // Derive from cache synchronously during render — no extra re-render needed.
  if (!url) return ''
  const cached = blobCache.peek(url)
  if (cached) return cached
  return pending?.for === url ? pending.blob : ''
}
