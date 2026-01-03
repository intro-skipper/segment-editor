/**
 * MediaCard - Clickable media item card with dynamic color extraction.
 * Navigates to appropriate view based on item type.
 */

import { memo, useCallback, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import type { BaseItemDto } from '@/types/jellyfin'
import { BaseItemKind } from '@/types/jellyfin'
import { ItemImage } from '@/components/media/ItemImage'
import { getBestImageUrl } from '@/services/video/api'
import { useVibrantColor } from '@/hooks/use-vibrant-color'
import { cn } from '@/lib/utils'
import { getNavigationRoute } from '@/lib/navigation-utils'

export interface MediaCardProps {
  item: BaseItemDto
  className?: string
  index?: number
  tabIndex?: number
  role?: 'gridcell'
  'data-grid-index'?: number
  'aria-selected'?: boolean
  onFocus?: (index: number) => void
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

export const MediaCard = memo(function MediaCard({
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
  const imageUrl = useMemo(() => getBestImageUrl(item, 200), [item])
  const vibrantColors = useVibrantColor(imageUrl ?? null)

  const handleClick = useCallback(() => {
    const route = getNavigationRoute(item)
    // Type assertion needed due to dynamic route resolution
    navigate(route as unknown as Parameters<typeof navigate>[0])
  }, [item, navigate])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleClick()
      }
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

  const handleFocus = useCallback(() => {
    onFocus?.(index)
  }, [onFocus, index])

  return (
    <div
      role={role}
      tabIndex={tabIndex}
      data-grid-index={dataGridIndex}
      aria-selected={ariaSelected}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      aria-label={accessibleLabel}
      className={cn(
        'group cursor-pointer rounded-2xl overflow-hidden min-h-[44px]',
        'transition-all duration-300 ease-out',
        'hover:scale-[1.03] hover:shadow-xl hover:shadow-black/20',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'animate-in fade-in slide-in-from-bottom-3 duration-400 fill-mode-both',
        className,
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
            !vibrantColors && 'text-foreground group-hover:text-primary',
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
    </div>
  )
})

export default MediaCard
