/**
 * InteractiveCard - Reusable accessible card with keyboard navigation.
 * Consolidates duplicated patterns from SeriesView, AlbumView, ArtistView.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InteractiveCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Click handler for the card */
  onClick?: () => void
  /** Animation delay in ms for staggered entrance */
  animationDelay?: number
  /** Whether to animate entrance */
  animate?: boolean
  /** Accessible label for the card */
  'aria-label'?: string
}

/**
 * Accessible interactive card with keyboard support.
 * Handles Enter/Space key activation and focus management.
 */
export const InteractiveCard = React.memo(function InteractiveCard({
  onClick,
  animationDelay = 0,
  animate = false,
  className,
  style,
  children,
  'aria-label': ariaLabel,
  ...props
}: InteractiveCardProps) {
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onClick?.()
      }
    },
    [onClick],
  )

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label={ariaLabel}
      className={cn(
        'cursor-pointer transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        animate && 'animate-in fade-in slide-in-from-bottom-2 fill-mode-both',
        className,
      )}
      style={{
        ...(animate && animationDelay > 0
          ? { animationDelay: `${animationDelay}ms` }
          : {}),
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  )
})
