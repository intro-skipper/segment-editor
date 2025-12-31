import { useEffect, useMemo, useRef, useState } from 'react'
import { decode } from 'blurhash'

import type { BaseItemDto } from '@/types/jellyfin'
import { getBestImageUrl, getImageBlurhash } from '@/services/video/api'
import { cn } from '@/lib/utils'

export interface ItemImageProps {
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
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  // Get the image URL
  const imageUrl = useMemo(
    () => getBestImageUrl(item, maxWidth, maxHeight),
    [item, maxWidth, maxHeight],
  )

  // Get and decode the blurhash
  const blurhashDataUrl = useMemo(() => {
    const blurhash = getImageBlurhash(item)
    if (!blurhash) return null
    return decodeBlurhashToDataUrl(blurhash)
  }, [item])

  // Reset state when item changes
  useEffect(() => {
    setIsLoaded(false)
    setHasError(false)
  }, [item.Id])

  // Check if image is already cached
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setIsLoaded(true)
    }
  }, [imageUrl])

  const handleLoad = () => {
    setIsLoaded(true)
  }

  const handleError = () => {
    setHasError(true)
  }

  const displayAlt = alt || item.Name || 'Media item'

  // No image available
  if (!imageUrl || hasError) {
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

      {/* Actual image */}
      <img
        ref={imgRef}
        src={imageUrl}
        alt={displayAlt}
        onLoad={handleLoad}
        onError={handleError}
        className={cn(
          'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
          isLoaded ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  )
}

export default ItemImage
