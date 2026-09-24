import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const iconDiscVariants = cva(
  'flex shrink-0 items-center justify-center rounded-full [&_svg]:shrink-0',
  {
    variants: {
      tone: {
        muted: 'bg-muted text-muted-foreground',
        primary: 'bg-primary/10 text-primary',
        success: 'bg-success/10 text-success',
        destructive: 'bg-destructive/10 text-destructive',
      },
      size: {
        default: "size-12 [&_svg:not([class*='size-'])]:size-6",
        lg: "size-16 [&_svg:not([class*='size-'])]:size-8",
      },
    },
    defaultVariants: {
      tone: 'muted',
      size: 'default',
    },
  },
)

/**
 * Round, tinted backdrop for one decorative icon above a heading: dialog and
 * wizard headers, empty and error states. `lg` is for full-page states.
 * Hidden from assistive tech, so the heading next to it must carry the meaning.
 */
function IconDisc({
  tone,
  size,
  className,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof iconDiscVariants>) {
  return (
    <div
      data-slot="icon-disc"
      aria-hidden="true"
      className={cn(iconDiscVariants({ tone, size, className }))}
      {...props}
    />
  )
}

export { IconDisc }
