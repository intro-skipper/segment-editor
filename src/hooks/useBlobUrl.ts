/**
 * Hook to fetch an image URL and convert it to a blob URL.
 * This works around COEP restrictions when the server doesn't provide
 * Cross-Origin-Resource-Policy headers.
 *
 * Uses the shared blobCache and fetchBlobUrl for consistency with useVibrantColor.
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  blobCache,
  fetchBlobUrl,
  getBlobCacheSnapshot,
  subscribeBlobCache,
} from '@/lib/cache-manager'

/**
 * Fetches an image URL and returns a blob URL that bypasses COEP restrictions.
 * @param url - The image URL to fetch
 * @returns The blob URL, or empty string if not yet loaded or failed
 */
export function useBlobUrl(url: string | null | undefined): string {
  const blobCacheRevision = useSyncExternalStore(
    subscribeBlobCache,
    getBlobCacheSnapshot,
    getBlobCacheSnapshot,
  )
  const [, rerenderAfterBlobLoad] = useState(0)

  useEffect(() => {
    if (!url) return

    const cached = blobCache.get(url)
    if (cached) return

    let cancelled = false
    void fetchBlobUrl(url).then((result) => {
      if (!cancelled && result && blobCache.peek(url) !== result) {
        rerenderAfterBlobLoad((version) => version + 1)
      }
    })
    return () => {
      cancelled = true
    }
  }, [url, blobCacheRevision])

  if (!url) return ''
  const cached = blobCache.peek(url)

  // Pure render-time fallback for already-populated caches. Cached hits are
  // promoted in the effect above without scheduling an extra state update.
  return cached ?? ''
}
