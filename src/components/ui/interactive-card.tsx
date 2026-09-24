import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const interactiveCardVariants = cva(
  'group w-full cursor-pointer overflow-hidden rounded-2xl border border-border/50 bg-card text-left',
  {
    variants: {
      variant: {
        tile: 'hover:scale-102',
        row: 'flex items-center gap-3 p-3 hover:border-border md:gap-4',
      },
    },
    defaultVariants: {
      variant: 'row',
    },
  },
)

type InteractiveCardProps = React.ComponentProps<'button'> &
  VariantProps<typeof interactiveCardVariants> & {
    animate?: boolean
    /** Stagger offset for the entrance animation; only read when `animate` is set. */
    animationDelay?: string
    'data-grid-index'?: number
  }

/**
 * Clickable card for media tiles and list rows. Owns the card chrome and hover
 * feedback so callers only add layout. `tile` is for image-led grid cells,
 * `row` for horizontal list entries.
 */
export function InteractiveCard({
  variant,
  animate = false,
  animationDelay,
  className,
  style,
  ...props
}: InteractiveCardProps) {
  // Applied before `style` so a caller-supplied delay still wins.
  const animationStyle: React.CSSProperties | undefined =
    animate && animationDelay ? { animationDelay } : undefined

  return (
    <button
      type="button"
      data-interactive-transition="true"
      className={cn(
        interactiveCardVariants({ variant }),
        animate && 'animate-in fade-in slide-in-from-bottom-2 fill-mode-both',
        className,
      )}
      style={{ ...animationStyle, ...style }}
      {...props}
    />
  )
}
