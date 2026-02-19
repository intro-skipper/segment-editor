'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

function Label({ className, ...props }: React.ComponentProps<'label'>) {
  const { htmlFor, ...restProps } = props

  if (!htmlFor) {
    return (
      <span
        data-slot="label"
        className={cn(
          'gap-2 text-sm leading-none font-medium group-data-[disabled=true]:opacity-50 peer-disabled:opacity-50 flex items-center select-none group-data-[disabled=true]:pointer-events-none peer-disabled:cursor-not-allowed',
          className,
        )}
        {...restProps}
      />
    )
  }

  return (
    <label
      htmlFor={htmlFor}
      data-slot="label"
      className={cn(
        'gap-2 text-sm leading-none font-medium group-data-[disabled=true]:opacity-50 peer-disabled:opacity-50 flex items-center select-none group-data-[disabled=true]:pointer-events-none peer-disabled:cursor-not-allowed',
        className,
      )}
      {...restProps}
    />
  )
}

export { Label }
