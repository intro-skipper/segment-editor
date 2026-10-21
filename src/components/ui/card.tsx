import * as React from 'react'

import { cn } from '@/lib/utils'

function Card({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<'div'> & { size?: 'default' | 'sm' }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        'ring-foreground/10 bg-card text-card-foreground gap-6 overflow-clip rounded-2xl py-6 text-sm ring-1 has-[>img:first-child]:pbs-0 data-[size=sm]:gap-4 data-[size=sm]:py-4 *:[img:first-child]:rounded-ss-xl *:[img:first-child]:rounded-se-xl *:[img:last-child]:rounded-es-xl *:[img:last-child]:rounded-ee-xl group/card flex flex-col',
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'gap-2 rounded-ss-xl rounded-se-xl px-6 group-data-[size=sm]/card:px-4 [.border-be]:pbe-6 group-data-[size=sm]/card:[.border-be]:pbe-4 group/card-header @container/card-header grid auto-rows-min items-start has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto]',
        className,
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('text-base font-medium', className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('px-6 group-data-[size=sm]/card:px-4', className)}
      {...props}
    />
  )
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent }
