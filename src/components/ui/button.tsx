import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { buttonVariants } from './button-variants'
import type { VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-interactive-transition="true"
      className={cn(
        'touch-manipulation',
        buttonVariants({ variant, size, className }),
      )}
      {...props}
    />
  )
}

export { Button }
