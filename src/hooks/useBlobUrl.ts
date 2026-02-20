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
    setBlobUrl(cached ?? '')
    if (cached) {
      return
    }

    const controller = new AbortController()

    fetchBlobUrl(url, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted && result) {
        setBlobUrl(result)
      }
    })

    return () => {
      controller.abort()
    }
  }, [url])

  return blobUrl
}
