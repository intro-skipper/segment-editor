import { useRef } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import type { BaseItemDto } from '@/types/jellyfin'
import { ItemImage } from '@/components/media/ItemImage'
import { cn } from '@/lib/utils'
import { navigateToMediaItem, preloadMediaRoute } from '@/lib/navigation-utils'
import { staggerDelay, STAGGER_FAST } from '@/lib/animation-utils'
import {
  getMediaItemLabel,
  getSeriesCountLabel,
} from '@/components/filter/media-item-label'

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

export const MediaCard = function MediaCardComponent({
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
  const hasPrefetchedRef = useRef(false)

  const prefetchRoute = () => {
    if (hasPrefetchedRef.current || !item.Id) return

    hasPrefetchedRef.current = true
    preloadMediaRoute(router.preloadRoute, item)
  }

  const handleFocusPrefetch = (event: React.FocusEvent<HTMLElement>) => {
    prefetchRoute()
    onFocus?.(event)
  }

  const handleNavigateToItem = () => {
    navigateToMediaItem(navigate, item)
  }

  const accessibleLabel = getMediaItemLabel(t, item)
  const countLabel = getSeriesCountLabel(t, item)
  const metaText = [item.ProductionYear, countLabel]
    .filter(Boolean)
    .join(' \u00B7 ')

  // Derived values - no useMemo needed for simple computations
  const animationDelay = staggerDelay(index, STAGGER_FAST)

  return (
    <div
      role={role}
      aria-selected={ariaSelected}
      className={cn('rounded-2xl min-h-[44px]', className)}
    >
      <button
        type="button"
        tabIndex={tabIndex}
        data-grid-index={dataGridIndex}
        aria-label={accessibleLabel}
        onClick={handleNavigateToItem}
        onFocus={handleFocusPrefetch}
        onPointerEnter={prefetchRoute}
        onTouchStart={prefetchRoute}
        className={cn(
          'group cursor-pointer rounded-2xl overflow-hidden min-h-[44px] w-full text-left',
          'bg-card border border-border/50',
          'transition-[transform,box-shadow,border-color] duration-200 ease-out',
          'hover:scale-[1.02] active:scale-[0.98]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'animate-in fade-in slide-in-from-bottom-3 animation-duration-400 fill-mode-both',
        )}
        style={{ animationDelay }}
      >
        <ItemImage
          item={item}
          maxWidth={200}
          aspectRatio="aspect-[2/3]"
          className="w-full"
        />

        <div className="px-3 py-2.5 md:px-4 md:py-3">
          <p
            className="text-sm md:text-base font-semibold truncate leading-snug text-foreground"
            title={item.Name || undefined}
          >
            {item.Name || 'Unknown'}
          </p>

          {/* Year and series counts - fixed height keeps grid rows aligned */}
          <p className="text-xs md:text-sm font-medium h-[1.25em] truncate text-muted-foreground">
            {metaText || '\u00A0'}
          </p>
        </div>
      </button>
    </div>
  )
}
