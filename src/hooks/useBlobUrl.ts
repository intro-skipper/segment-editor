/**
 * Hook to fetch an image URL and convert it to a blob URL.
 * This works around COEP restrictions when the server doesn't provide
 * Cross-Origin-Resource-Policy headers.
 *
 * Uses the shared blobCache and fetchBlobUrl for consistency with useVibrantColor.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  blobCache,
  fetchBlobUrl,
  getBlobCacheUrlSnapshot,
  subscribeBlobCacheUrl,
} from '@/lib/cache-manager'

/**
 * Fetches an image URL and returns a blob URL that bypasses COEP restrictions.
 * @param url - The image URL to fetch
 * @returns The blob URL, or empty string if not yet loaded or failed
 */
export function useBlobUrl(url: string | null | undefined): string {
  const blobCacheRevision = useSyncExternalStore(
    (onStoreChange) => subscribeBlobCacheUrl(url, onStoreChange),
    () => getBlobCacheUrlSnapshot(url),
    () => getBlobCacheUrlSnapshot(url),
  )
  const [, rerenderAfterBlobLoad] = useState(0)
  const previousUrlRef = useRef<string | null | undefined>(undefined)
  const lastFetchAttemptUrlRef = useRef<string | null>(null)
  const lastRenderedBlobUrlRef = useRef<string | null>(null)

  const cached = url ? blobCache.peek(url) : undefined

  useEffect(() => {
    if (previousUrlRef.current !== url) {
      previousUrlRef.current = url
      lastFetchAttemptUrlRef.current = null
      lastRenderedBlobUrlRef.current = null
    }

    if (!url) return

    const promotedCached = blobCache.get(url)
    if (promotedCached) {
      lastRenderedBlobUrlRef.current = promotedCached
      return
    }

    const shouldRetryEvictedActiveUrl =
      lastRenderedBlobUrlRef.current !== null &&
      lastFetchAttemptUrlRef.current === url
    if (
      lastFetchAttemptUrlRef.current === url &&
      !shouldRetryEvictedActiveUrl
    ) {
      return
    }

    lastFetchAttemptUrlRef.current = url
    lastRenderedBlobUrlRef.current = null

    let cancelled = false
    void fetchBlobUrl(url).then((result) => {
      if (!cancelled && result) {
        rerenderAfterBlobLoad((version) => version + 1)
      }
    })
    return () => {
      cancelled = true
    }
  }, [url, blobCacheRevision, cached])

  if (!url) return ''
  return cached ?? ''
}
