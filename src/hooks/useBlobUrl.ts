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
  const [blobUrl, setBlobUrl] = useState(() =>
    url ? (blobCache.get(url) ?? '') : '',
  )

  useEffect(() => {
    if (!url) {
      setBlobUrl('')
      return
    }

    // Check cache synchronously first
    const cached = blobCache.get(url)
    if (cached) {
      setBlobUrl(cached)
      return
    }

    let cancelled = false

    fetchBlobUrl(url).then((result) => {
      if (!cancelled && result) {
        setBlobUrl(result)
      }
    })

    return () => {
      cancelled = true
    }
  }, [url])

  return blobUrl
}
