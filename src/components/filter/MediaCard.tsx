import { useRef } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import type { BaseItemDto } from '@/types/jellyfin'
import { ItemImage } from '@/components/media/ItemImage'
import { InteractiveCard } from '@/components/ui/interactive-card'
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
      className={cn('rounded-2xl min-h-11', className)}
    >
      <InteractiveCard
        variant="tile"
        tabIndex={tabIndex}
        data-grid-index={dataGridIndex}
        aria-label={accessibleLabel}
        onClick={handleNavigateToItem}
        onFocus={handleFocusPrefetch}
        onPointerEnter={prefetchRoute}
        onTouchStart={prefetchRoute}
        animate
        animationDelay={animationDelay}
        className="min-h-11"
      >
        <ItemImage
          item={item}
          maxWidth={200}
          aspectRatio="aspect-2/3"
          className="w-full"
        />

        <div className="px-3 py-2.5 md:px-4 md:py-3">
          <p
            className="text-sm md:text-base font-semibold truncate leading-snug text-foreground"
            title={item.Name || undefined}
          >
            {item.Name || 'Unknown'}
          </p>

          {/* Year and series counts - the nbsp fallback keeps one line so grid rows stay aligned */}
          <p className="text-xs md:text-sm font-medium truncate text-muted-foreground">
            {metaText || '\u00A0'}
          </p>
        </div>
      </InteractiveCard>
    </div>
  )
}
