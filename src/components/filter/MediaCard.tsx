/**
 * MediaCard - Clickable media item card with dynamic color extraction.
 * Navigates to appropriate view based on item type.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import type { BaseItemDto } from '@/types/jellyfin'
import { BaseItemKind } from '@/types/jellyfin'
import { ItemImage } from '@/components/media/ItemImage'
import { getBestImageUrl } from '@/services/video/api'
import { useVibrantColor } from '@/hooks/use-vibrant-color'
import { cn } from '@/lib/utils'
import { navigateToMediaItem, preloadMediaRoute } from '@/lib/navigation-utils'

interface MediaCardProps {
  item: BaseItemDto
  className?: string
  index?: number
  tabIndex?: number
  role?: 'gridcell'
  'data-grid-index'?: number
  'aria-selected'?: boolean
  onFocus?: (event: React.FocusEvent<HTMLElement>) => void
}

const INTERSECTION_ROOT_MARGIN = '240px'
const inViewCallbacks = new Map<Element, () => void>()
let sharedInViewObserver: IntersectionObserver | null = null

function cleanupInViewObserver() {
  if (inViewCallbacks.size > 0) return
  sharedInViewObserver?.disconnect()
  sharedInViewObserver = null
}

function getInViewObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') {
    return null
  }

  if (sharedInViewObserver) {
    return sharedInViewObserver
  }

  sharedInViewObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue

        const callback = inViewCallbacks.get(entry.target)
        if (!callback) continue

        inViewCallbacks.delete(entry.target)
        sharedInViewObserver?.unobserve(entry.target)
        callback()
      }

      cleanupInViewObserver()
    },
    { rootMargin: INTERSECTION_ROOT_MARGIN },
  )

  return sharedInViewObserver
}

function observeCardInView(element: Element, onVisible: () => void) {
  const observer = getInViewObserver()
  if (!observer) {
    onVisible()
    return () => undefined
  }

  inViewCallbacks.set(element, onVisible)
  observer.observe(element)

  return () => {
    inViewCallbacks.delete(element)
    observer.unobserve(element)
    cleanupInViewObserver()
  }
}

/** Label key mapping by item type */
const LABEL_KEY_MAP: Record<string, string> = {
  [BaseItemKind.Series]: 'accessibility.mediaCard.viewSeries',
  [BaseItemKind.MusicArtist]: 'accessibility.mediaCard.viewArtist',
  [BaseItemKind.MusicAlbum]: 'accessibility.mediaCard.viewAlbum',
  [BaseItemKind.Movie]: 'accessibility.mediaCard.playMovie',
  [BaseItemKind.Episode]: 'accessibility.mediaCard.playEpisode',
}

/** Max animation delay to prevent long waits on large grids */
const MAX_ANIMATION_DELAY = 300
const ANIMATION_STAGGER = 30

export const MediaCard = memo(function MediaCardComponent({
  item,
  className,
  index = 0,
  tabIndex = 0,
  role = 'gridcell',
  'data-grid-index': dataGridIndex,
  'aria-selected': ariaSelected,
  onFocus,
}: MediaCardProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const router = useRouter()
  const cardRef = useRef<HTMLDivElement>(null)
  const hasPrefetchedRef = useRef(false)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    const element = cardRef.current
    if (!element) return

    return observeCardInView(element, () => {
      setIsInView(true)
    })
  }, [])

  const imageUrl = useMemo(() => getBestImageUrl(item, 200), [item])
  const vibrantColors = useVibrantColor(imageUrl ?? null, {
    enabled: isInView,
  })

  const prefetchRoute = useCallback(() => {
    if (hasPrefetchedRef.current || !item.Id) return

    hasPrefetchedRef.current = true
    preloadMediaRoute(router.preloadRoute, item)
  }, [item, router])

  const handleFocus = useCallback(
    (event: React.FocusEvent<HTMLElement>) => {
      prefetchRoute()
      onFocus?.(event)
    },
    [onFocus, prefetchRoute],
  )

  const handleClick = useCallback(() => {
    navigateToMediaItem(navigate, item)
  }, [item, navigate])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      handleClick()
    },
    [handleClick],
  )

  // Compute accessible label using translation
  const accessibleLabel = useMemo(() => {
    const name = item.Name ?? 'Unknown'
    const year = item.ProductionYear ? ` (${item.ProductionYear})` : ''
    const labelKey =
      LABEL_KEY_MAP[item.Type ?? ''] ?? 'accessibility.mediaCard.play'
    return t(labelKey, { name: `${name}${year}` })
  }, [item, t])

  // Derived values - no useMemo needed for simple computations
  const animationDelay = Math.min(
    index * ANIMATION_STAGGER,
    MAX_ANIMATION_DELAY,
  )

  // Memoize style objects to prevent re-renders
  const textBoxStyle = useMemo(
    () =>
      vibrantColors
        ? {
            background: vibrantColors.primary,
            color: vibrantColors.text,
          }
        : undefined,
    [vibrantColors],
  )

  const cardStyle = useMemo(
    () => ({
      animationDelay: `${animationDelay}ms`,
      backgroundColor: vibrantColors?.primary ?? 'var(--card)',
    }),
    [animationDelay, vibrantColors?.primary],
  )

  const textStyle = useMemo(
    () => (vibrantColors ? { color: vibrantColors.text } : undefined),
    [vibrantColors],
  )

  return (
    <div
      ref={cardRef}
      role={role}
      aria-selected={ariaSelected}
      className={cn('rounded-2xl min-h-[44px]', className)}
    >
      <button
        type="button"
        tabIndex={tabIndex}
        data-grid-index={dataGridIndex}
        aria-label={accessibleLabel}
        onClick={handleClick}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        onPointerEnter={prefetchRoute}
        onTouchStart={prefetchRoute}
        className={cn(
          'group cursor-pointer rounded-2xl overflow-hidden min-h-[44px] w-full text-left',
          'transition-[transform,box-shadow,border-color,background-color,color] duration-200 ease-out',
          'hover:scale-[1.02] active:scale-[0.98]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'animate-in fade-in slide-in-from-bottom-3 duration-400 fill-mode-both',
        )}
        style={cardStyle}
      >
        {/* Item Thumbnail */}
        <ItemImage
          item={item}
          maxWidth={200}
          aspectRatio="aspect-[2/3]"
          className="w-full"
        />

        {/* Item Name - with extracted poster color */}
        <div
          className="px-3 py-2.5 md:px-4 md:py-3 transition-colors duration-500"
          style={textBoxStyle}
        >
          {/* Title - fixed height for 2 lines */}
          <p
            className={cn(
              'text-sm md:text-base font-semibold line-clamp-2 leading-snug h-[2.5em]',
              !vibrantColors && 'text-foreground',
            )}
            style={textStyle}
            title={item.Name || undefined}
          >
            {item.Name || 'Unknown'}
          </p>

          {/* Year - always in third row */}
          <p
            className={cn(
              'text-xs md:text-sm opacity-70 font-medium h-[1.25em]',
              !vibrantColors && 'text-muted-foreground',
            )}
            style={textStyle}
          >
            {item.ProductionYear ?? '\u00A0'}
          </p>
        </div>
      </button>
    </div>
  )
})
