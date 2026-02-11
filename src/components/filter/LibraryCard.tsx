/**
 * LibraryCard - Clickable library collection card with 16:9 aspect ratio.
 * Similar to MediaCard but designed for library/collection display.
 */

import { memo, useCallback, useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'

import type { VirtualFolderInfo } from '@/types/jellyfin'
import { getServerBaseUrl } from '@/services/jellyfin'
import { useBlobUrl } from '@/hooks/useBlobUrl'
import { cn } from '@/lib/utils'

export interface LibraryCardProps {
  /** The library/collection item */
  collection: VirtualFolderInfo
  /** Icon to display */
  Icon: LucideIcon
  /** Click handler */
  onClick: () => void
  /** Optional CSS classes */
  className?: string
  /** Index for animation stagger */
  index?: number
}

/** Max animation delay to prevent long waits */
const MAX_ANIMATION_DELAY = 300
const ANIMATION_STAGGER = 30

export const LibraryCard = memo(function LibraryCard({
  collection,
  Icon,
  onClick,
  className,
  index = 0,
}: LibraryCardProps) {
  const { t } = useTranslation()
  const [imageError, setImageError] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  // Construct the direct image URL for the library
  const rawImageUrl = useMemo(() => {
    if (!collection.ItemId) return null
    const baseUrl = getServerBaseUrl()
    return `${baseUrl}/Items/${collection.ItemId}/Images/Primary?maxWidth=480`
  }, [collection.ItemId])

  // Convert to blob URL for COEP compliance
  const imageUrl = useBlobUrl(rawImageUrl)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onClick()
      }
    },
    [onClick],
  )

  const accessibleLabel = t('items.selectLibraryButton', {
    name: collection.Name || 'Unknown',
    defaultValue: `Browse ${collection.Name || 'Unknown'} library`,
  })

  // Derived values
  const animationDelay = Math.min(
    index * ANIMATION_STAGGER,
    MAX_ANIMATION_DELAY,
  )

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label={accessibleLabel}
      className={cn(
        'group cursor-pointer rounded-2xl overflow-hidden',
        'bg-card border border-border/50',
        'transition-all duration-200',
        'hover:scale-[1.02] active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'animate-in fade-in slide-in-from-bottom-3 duration-400 fill-mode-both',
        className,
      )}
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      {/* Library Image - 16:9 aspect ratio */}
      <div className="relative aspect-video bg-muted overflow-hidden">
        {imageUrl && !imageError ? (
          <img
            src={imageUrl}
            alt={collection.Name || 'Library'}
            loading="lazy"
            decoding="async"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
            className={cn(
              'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
              imageLoaded ? 'opacity-100' : 'opacity-0',
            )}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon
              className="size-12 text-muted-foreground/50"
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      {/* Library Name and Icon */}
      <div className="px-3 py-2.5 md:px-4 md:py-3 flex items-center gap-2 bg-secondary">
        <Icon
          className="size-5 flex-shrink-0"
          aria-hidden="true"
        />
        <p
          className="text-sm md:text-base font-semibold line-clamp-1 leading-snug group-hover:text-primary"
          title={collection.Name || undefined}
        >
          {collection.Name || 'Unknown'}
        </p>
      </div>
    </div>
  )
})

export default LibraryCard
