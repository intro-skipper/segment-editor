import { useEffect, useRef, useState } from 'react'
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

const blurhashCache = new Map<string, string>()
const MAX_CACHE_SIZE = 100

function decodeBlurhashToDataUrl(
  blurhash: string,
  width: number = 32,
  height: number = 32,
): string | null {
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

  const rawImageUrl = getBestImageUrl(item, maxWidth, maxHeight) ?? null
  const useBlobFallback =
    rawImageUrl !== null && blobFallbackSource === rawImageUrl
  const blobImageUrl = useBlobUrl(useBlobFallback ? rawImageUrl : null)
  const imageUrl = useBlobFallback ? blobImageUrl : rawImageUrl

  const blurhash = getImageBlurhash(item) ?? null
  const cachedBlurhashDataUrl = blurhash
    ? (blurhashCache.get(`${blurhash}-32-32`) ?? null)
    : null

  const blurhashDataUrl =
    cachedBlurhashDataUrl ??
    (decodedBlurhashState?.blurhash === blurhash
      ? decodedBlurhashState.dataUrl
      : null)

  useEffect(() => {
    if (!blurhash || cachedBlurhashDataUrl) {
      return
    }

    let cancelled = false
    let idleCallbackId: number | null = null
    let timeoutId: number | null = null

    const decodeBlurhash = () => {
      const decoded = decodeBlurhashToDataUrl(blurhash)
      if (!cancelled) {
        setDecodedBlurhashState({ blurhash, dataUrl: decoded })
      }
    }

    if (typeof window.requestIdleCallback === 'function') {
      idleCallbackId = window.requestIdleCallback(decodeBlurhash, {
        timeout: 180,
      })
    } else {
      timeoutId = window.setTimeout(decodeBlurhash, 100)
    }

    return () => {
      cancelled = true
      if (
        idleCallbackId !== null &&
        typeof window.cancelIdleCallback === 'function'
      ) {
        window.cancelIdleCallback(idleCallbackId)
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [blurhash, cachedBlurhashDataUrl])

  const imageKey = imageUrl || rawImageUrl || item.Id
  const isLoaded = imageUrl !== null && loadedSource === imageUrl

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

  const hasFinalImageError = imageUrl !== null && failedSource === imageUrl
  const shouldShowFallback =
    (!imageUrl && !blurhashDataUrl) || hasFinalImageError

  if (shouldShowFallback) {
    if (!showFallback) return null

    return (
      <div
        key={failedSource ?? 'no-image'}
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
      {blurhashDataUrl && !isLoaded && (
        <img
          src={blurhashDataUrl}
          alt=""
          width={1}
          height={1}
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {imageUrl && (
        <img
          ref={(el) => {
            imgRef.current = el
            if (el?.complete && el.naturalWidth > 0) {
              setLoadedSource(el.currentSrc || imageUrl)
            }
          }}
          src={imageUrl}
          alt={displayAlt}
          width={1}
          height={1}
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
