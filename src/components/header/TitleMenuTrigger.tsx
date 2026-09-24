import { ChevronDown } from 'lucide-react'
import type { ComponentProps } from 'react'

import { DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

type TitleMenuTriggerProps = Omit<
  ComponentProps<typeof DropdownMenuTrigger>,
  'className'
> & { className?: string }

/** Page-title dropdown trigger: the heading passed as children plus a chevron, dimming on hover. */
export function TitleMenuTrigger({
  className,
  children,
  ...props
}: TitleMenuTriggerProps) {
  return (
    <DropdownMenuTrigger
      className={cn(
        'flex min-w-0 max-w-full items-center gap-2 rounded-lg transition-opacity hover:opacity-80',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown
        className="size-5 shrink-0 text-muted-foreground"
        aria-hidden
      />
    </DropdownMenuTrigger>
  )
}
