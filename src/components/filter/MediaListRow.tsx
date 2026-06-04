import type { FocusEvent } from 'react'
import type { BaseItemDto } from '@/types/jellyfin'
import { ItemImage } from '@/components/media/ItemImage'
import { InteractiveCard } from '@/components/ui/interactive-card'
import { useVibrantColor } from '@/hooks/use-vibrant-color'
import { getBestImageUrl } from '@/services/video/api'
import { cn } from '@/lib/utils'
import { staggerDelay, STAGGER_FAST } from '@/lib/animation-utils'

interface MediaListRowInteractiveProps {
  role?: 'gridcell'
  tabIndex?: number
  'data-grid-index'?: number
  'aria-selected'?: boolean
  onFocus?: (event: FocusEvent<HTMLElement>) => void
}

interface MediaListRowProps {
  item: BaseItemDto
  index: number
  label: string
  interactiveProps?: MediaListRowInteractiveProps
  onActivate: () => void
}

export function MediaListRow({
  item,
  index,
  label,
  interactiveProps,
  onActivate,
}: MediaListRowProps) {
  const imageUrl = getBestImageUrl(item, 160, 240) ?? null
  const vibrantColors = useVibrantColor(imageUrl)
  const animationDelay = staggerDelay(index, STAGGER_FAST)
  const secondaryParts = [item.ProductionYear, item.Type].filter(Boolean)
  const cardStyle = vibrantColors
    ? { backgroundColor: vibrantColors.primary }
    : undefined
  const textStyle = vibrantColors ? { color: vibrantColors.text } : undefined

  return (
    <InteractiveCard
      aria-label={label}
      onClick={onActivate}
      {...interactiveProps}
      animate
      animationDelay={animationDelay}
      className={cn(
        'group flex items-center gap-4 md:gap-5 p-3 md:p-4 rounded-2xl md:rounded-3xl',
        !vibrantColors && 'bg-card/60 backdrop-blur-sm',
        'hover:shadow-lg hover:shadow-black/10',
      )}
      style={cardStyle}
    >
      <div className="relative flex-shrink-0 w-16 md:w-20 rounded-xl md:rounded-2xl overflow-hidden bg-muted shadow-md">
        <ItemImage
          item={item}
          maxWidth={160}
          maxHeight={240}
          aspectRatio="aspect-[2/3]"
          className="w-full"
        />
      </div>
      <div className="flex-grow min-w-0 py-0.5 md:py-1">
        <p
          className={cn(
            'font-semibold line-clamp-2 leading-tight text-base md:text-lg min-h-[calc(2*1lh)]',
            !vibrantColors && 'text-foreground',
          )}
          style={textStyle}
          title={item.Name || undefined}
        >
          {item.Name || 'Unknown'}
        </p>
        {secondaryParts.length > 0 && (
          <p
            className={cn(
              'text-sm md:text-base truncate mt-0.5 md:mt-1 opacity-80',
              !vibrantColors && 'text-muted-foreground',
            )}
            style={textStyle}
          >
            {secondaryParts.join(' · ')}
          </p>
        )}
      </div>
    </InteractiveCard>
  )
}
