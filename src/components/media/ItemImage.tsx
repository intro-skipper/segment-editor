import { useEffect, useMemo, useRef, useState } from 'react'
import { decode } from 'blurhash'

import type { BaseItemDto } from '@/types/jellyfin'
import { getBestImageUrl, getImageBlurhash } from '@/services/video/api'
import { useBlobUrl } from '@/hooks/useBlobUrl'
import { cn } from '@/lib/utils'

interface ItemImageProps {
  /** The Jellyfin item to display an image for */
  item: BaseItemDto
  /** Maximum width for the image */
  maxWidth?: number
  /** Maximum height for the image */
  maxHeight?: number
  /** Alt text for the image */
  alt?: string
  /** Additional CSS classes */
  className?: string
  /** Aspect ratio class (e.g., 'aspect-video', 'aspect-square') */
  aspectRatio?: string
  /** Whether to show a fallback when no image is available */
  showFallback?: boolean
}

// Cache for decoded blurhash data URLs to avoid re-decoding
const blurhashCache = new Map<string, string>()
const MAX_CACHE_SIZE = 100

/**
 * Decodes a blurhash string to a data URL with caching.
 * Uses canvas to render the blurhash pixels.
 */
function decodeBlurhashToDataUrl(
  blurhash: string,
  width: number = 32,
  height: number = 32,
): string | null {
  // Check cache first
  const cacheKey = `${blurhash}-${width}-${height}`
  const cached = blurhashCache.get(cacheKey)
  if (cached) return cached

  try {
    const pixels = decode(blurhash, width, height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const imageData = ctx.createImageData(width, height)
    imageData.data.set(pixels)
    ctx.putImageData(imageData, 0, 0)

    const dataUrl = canvas.toDataURL()

    // Add to cache with LRU eviction
    if (blurhashCache.size >= MAX_CACHE_SIZE) {
      const firstKey = blurhashCache.keys().next().value
      if (firstKey) blurhashCache.delete(firstKey)
    }
    blurhashCache.set(cacheKey, dataUrl)

    return dataUrl
  } catch {
    return null
  }
}

/**
 * ItemImage component displays a media item's image with blurhash placeholder.
 * Shows a blurred placeholder while the full image loads, then fades in the actual image.
 */
export function ItemImage({
  item,
  maxWidth = 300,
  maxHeight,
  alt,
  className,
  aspectRatio = 'aspect-[2/3]',
  showFallback = true,
}: ItemImageProps) {
  const [loadedSource, setLoadedSource] = useState<string | null>(null)
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const [blobFallbackSource, setBlobFallbackSource] = useState<string | null>(
    null,
  )
  const imgRef = useRef<HTMLImageElement>(null)
  const [decodedBlurhashState, setDecodedBlurhashState] = useState<{
    blurhash: string
    dataUrl: string | null
  } | null>(null)

  // Start with the raw image URL to avoid unnecessary blob fetches.
  // Fall back to blob URL only if the raw URL fails due to COEP/CORP restrictions.
  const rawImageUrl = useMemo(
    () => getBestImageUrl(item, maxWidth, maxHeight) ?? null,
    [item, maxWidth, maxHeight],
  )
  const useBlobFallback =
    rawImageUrl !== null && blobFallbackSource === rawImageUrl
  const blobImageUrl = useBlobUrl(useBlobFallback ? rawImageUrl : null)
  const imageUrl = useBlobFallback ? blobImageUrl : rawImageUrl

  // Resolve blurhash lazily to keep render path cheap.
  const blurhash = useMemo(() => getImageBlurhash(item) ?? null, [item])
  const cachedBlurhashDataUrl = useMemo(() => {
    if (!blurhash) return null
    return blurhashCache.get(`${blurhash}-32-32`) ?? null
  }, [blurhash])

  const blurhashDataUrl = useMemo(() => {
    if (!blurhash) return null
    if (cachedBlurhashDataUrl) return cachedBlurhashDataUrl
    if (decodedBlurhashState?.blurhash === blurhash) {
      return decodedBlurhashState.dataUrl
    }
    return null
  }, [blurhash, cachedBlurhashDataUrl, decodedBlurhashState])

  useEffect(() => {
    if (!blurhash || cachedBlurhashDataUrl) {
      return
    }

    let cancelled = false
    const idleCallbackId = window.requestIdleCallback(
      () => {
        const decoded = decodeBlurhashToDataUrl(blurhash)
        if (!cancelled) {
          setDecodedBlurhashState({ blurhash, dataUrl: decoded })
        }
      },
      {
        timeout: 180,
      },
    )

    return () => {
      cancelled = true
      window.cancelIdleCallback(idleCallbackId)
    }
  }, [blurhash, cachedBlurhashDataUrl])

  // Reset state when image source changes using key pattern
  const imageKey = imageUrl || rawImageUrl || item.Id
  const isLoaded = imageUrl !== null && loadedSource === imageUrl
  const hasError = imageUrl !== null && failedSource === imageUrl

  const handleLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const src = event.currentTarget.currentSrc || imageUrl
    if (!src) return
    setLoadedSource(src)
    setFailedSource((previous) => (previous === src ? null : previous))
  }

  const handleError = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const failedUrl = event.currentTarget.currentSrc || imageUrl

    if (!useBlobFallback && rawImageUrl) {
      setBlobFallbackSource(rawImageUrl)
      return
    }

    if (failedUrl) {
      setFailedSource(failedUrl)
    }
  }

  const displayAlt = alt || item.Name || 'Media item'

  // No image available and no placeholder to show
  if ((!imageUrl && !blurhashDataUrl) || hasError) {
    if (!showFallback) return null

    return (
      <div
        className={cn(
          'bg-muted flex items-center justify-center rounded-lg overflow-hidden',
          aspectRatio,
          className,
        )}
      >
        <span className="text-muted-foreground text-xs text-center px-2 line-clamp-2">
          {item.Name || 'No image'}
        </span>
      </div>
    )
  }

  return (
    <div
      key={imageKey}
      className={cn(
        'relative overflow-hidden rounded-lg bg-muted',
        aspectRatio,
        className,
      )}
    >
      {/* Blurhash placeholder */}
      {blurhashDataUrl && !isLoaded && (
        <img
          src={blurhashDataUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Actual image with native lazy loading */}
      {imageUrl && (
        <img
          ref={(el) => {
            imgRef.current = el
            // Check if already cached when ref is set
            if (el?.complete && el.naturalWidth > 0) {
              setLoadedSource(el.currentSrc || imageUrl)
            }
          }}
          src={imageUrl}
          alt={displayAlt}
          loading="lazy"
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          className={cn(
            'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
            isLoaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
    </div>
  )
}
