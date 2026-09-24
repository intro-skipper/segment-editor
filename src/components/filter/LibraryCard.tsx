/**
 * LibraryCard - Clickable library collection card with 16:9 aspect ratio.
 * Similar to MediaCard but designed for library/collection display.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'

import type { VirtualFolderInfo } from '@/types/jellyfin'
import { getServerBaseUrl } from '@/services/jellyfin'
import { useBlobUrl } from '@/hooks/useBlobUrl'
import { InteractiveCard } from '@/components/ui/interactive-card'
import { cn } from '@/lib/utils'
import { staggerDelay, STAGGER_FAST } from '@/lib/animation-utils'

interface LibraryCardProps {
  /** The library/collection item */
  collection: VirtualFolderInfo
  /** Icon to display */
  Icon: LucideIcon
  /** Selection handler */
  onSelect: (collectionId: string | null) => void
  /** Optional CSS classes */
  className?: string
  /** Index for animation stagger */
  index?: number
}

export const LibraryCard = function LibraryCardComponent({
  collection,
  Icon,
  onSelect,
  className,
  index = 0,
}: LibraryCardProps) {
  const { t } = useTranslation()
  const [imageError, setImageError] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [useBlobFallback, setUseBlobFallback] = useState(false)

  // Construct the direct image URL for the library
  const rawImageUrl = collection.ItemId
    ? `${getServerBaseUrl()}/Items/${collection.ItemId}/Images/Primary?maxWidth=480`
    : null

  // Start with the direct image URL; only fetch a blob fallback if COEP/CORS
  // blocks the image. Fetching every library image as a blob up front can
  // allocate a large number of object URLs during the library landing view.
  const blobImageUrl = useBlobUrl(useBlobFallback ? rawImageUrl : null)
  const imageUrl = useBlobFallback ? blobImageUrl : rawImageUrl

  const handleImageError = () => {
    if (!useBlobFallback && rawImageUrl) {
      setImageLoaded(false)
      setUseBlobFallback(true)
      return
    }

    setImageError(true)
  }

  const selectLibrary = () => {
    onSelect(collection.ItemId ?? null)
  }

  const accessibleLabel = t('items.selectLibraryButton', {
    name: collection.Name || 'Unknown',
    defaultValue: `Browse ${collection.Name || 'Unknown'} library`,
  })

  // Derived values
  const animationDelay = staggerDelay(index, STAGGER_FAST)

  return (
    <InteractiveCard
      variant="tile"
      onClick={selectLibrary}
      aria-label={accessibleLabel}
      animate
      animationDelay={animationDelay}
      className={className}
    >
      {/* Library Image - 16:9 aspect ratio */}
      <div className="relative aspect-video bg-muted overflow-hidden">
        {imageUrl && !imageError ? (
          <img
            src={imageUrl}
            alt={collection.Name || 'Library'}
            loading="lazy"
            width={480}
            height={270}
            decoding="async"
            onLoad={() => setImageLoaded(true)}
            onError={handleImageError}
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
      <div className="px-3 py-2.5 md:px-4 md:py-3 flex items-center gap-2 bg-card border-t border-border/50">
        <Icon
          className="size-5 flex-shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <p
          className="min-w-0 text-sm md:text-base font-semibold line-clamp-1 leading-snug text-foreground group-hover:text-primary"
          title={collection.Name || undefined}
        >
          {collection.Name || 'Unknown'}
        </p>
      </div>
    </InteractiveCard>
  )
}
