/**
 * Hook to fetch an image URL and convert it to a blob URL.
 * This works around COEP restrictions when the server doesn't provide
 * Cross-Origin-Resource-Policy headers.
 *
 * Uses the shared blobCache and fetchBlobUrl for consistency with useVibrantColor.
 */

import { useSyncExternalStore } from 'react'
import {
  blobCache,
  fetchBlobUrl,
  getBlobCacheUrlSnapshot,
  subscribeBlobCacheUrl,
} from '@/lib/cache-manager'

function subscribeBlobUrl(
  url: string | null | undefined,
  onStoreChange: () => void,
): () => void {
  const unsubscribe = subscribeBlobCacheUrl(url, () => {
    onStoreChange()
    if (url && !getBlobCacheUrlSnapshot(url)) {
      void fetchBlobUrl(url)
    }
  })

  if (url) {
    if (getBlobCacheUrlSnapshot(url)) {
      blobCache.get(url)
    } else {
      void fetchBlobUrl(url)
    }
  }

  return unsubscribe
}

/**
 * Fetches an image URL and returns a blob URL that bypasses COEP restrictions.
 * @param url - The image URL to fetch
 * @returns The blob URL, or empty string if not yet loaded or failed
 */
export function useBlobUrl(url: string | null | undefined): string {
  const cached = useSyncExternalStore(
    (onStoreChange) => subscribeBlobUrl(url, onStoreChange),
    () => getBlobCacheUrlSnapshot(url),
    () => getBlobCacheUrlSnapshot(url),
  )

  if (!url) return ''
  return cached
}
