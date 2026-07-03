import type { ComponentProps } from 'react'
import type { BaseItemDto } from '@/types/jellyfin'
import { ItemImage } from '@/components/media/ItemImage'
import { InteractiveCard } from '@/components/ui/interactive-card'
import { staggerDelay, STAGGER_FAST } from '@/lib/animation-utils'

type MediaListRowInteractiveProps = Pick<
  ComponentProps<typeof InteractiveCard>,
  'role' | 'tabIndex' | 'aria-selected' | 'onFocus'
> & {
  'data-grid-index'?: number
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
  label,
  index,
  interactiveProps,
  onActivate,
}: MediaListRowProps) {
  const animationDelay = staggerDelay(index, STAGGER_FAST)
  const secondaryParts = [item.ProductionYear, item.Type].filter(Boolean)

  return (
    <InteractiveCard
      aria-label={label}
      onClick={onActivate}
      {...interactiveProps}
      animate
      animationDelay={animationDelay}
      className="group flex items-center gap-3 md:gap-4 p-2.5 md:p-3 rounded-xl bg-card border border-border/50 hover:border-border"
    >
      <div className="relative flex-shrink-0 w-12 md:w-14 rounded-lg overflow-hidden bg-muted">
        <ItemImage
          item={item}
          maxWidth={160}
          maxHeight={240}
          aspectRatio="aspect-[2/3]"
          className="w-full"
        />
      </div>
      <div className="flex-grow min-w-0">
        <p
          className="font-medium text-sm md:text-base leading-snug line-clamp-2 text-foreground"
          title={item.Name || undefined}
        >
          {item.Name || 'Unknown'}
        </p>
        {secondaryParts.length > 0 && (
          <p className="text-xs truncate mt-0.5 text-muted-foreground">
            {secondaryParts.join(' · ')}
          </p>
        )}
      </div>
    </InteractiveCard>
  )
}
