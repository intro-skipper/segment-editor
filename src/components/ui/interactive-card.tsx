/**
 * InteractiveCard - Reusable accessible card with keyboard navigation.
 * Consolidates duplicated patterns from SeriesView, AlbumView, ArtistView.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

interface InteractiveCardProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
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
 * Renders as a native <button> for proper accessibility semantics.
 */
export const InteractiveCard = React.memo(function InteractiveCardComponent({
  onClick,
  animationDelay = 0,
  animate = false,
  className,
  style,
  children,
  'aria-label': ariaLabel,
  ...props
}: InteractiveCardProps) {
  return (
    <button
      type="button"
      data-interactive-transition="true"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        'cursor-pointer transition-[transform,box-shadow,background-color,color] duration-200 text-left w-full',
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
    </button>
  )
})
