import * as React from 'react'
import { cn } from '@/lib/utils'

interface InteractiveCardProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onClick?: () => void
  animationDelay?: string
  animate?: boolean
  'aria-label'?: string
}

export const InteractiveCard = function InteractiveCardComponent({
  onClick,
  animationDelay,
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
        ...(animate && animationDelay ? { animationDelay } : {}),
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  )
}
