import * as React from 'react'

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
} from 'lucide-react'
import type { VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button-variants'

function Pagination({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    <nav
      aria-label="pagination"
      data-slot="pagination"
      className={cn('mx-auto flex w-full justify-center', className)}
      {...props}
    />
  )
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn('gap-1 flex items-center', className)}
      {...props}
    />
  )
}

function PaginationItem({ ...props }: React.ComponentProps<'li'>) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationLinkProps = {
  isActive?: boolean
} & Pick<VariantProps<typeof buttonVariants>, 'size'> &
  (
    | ({ href: string } & React.ComponentProps<'a'>)
    | ({ href?: undefined } & React.ComponentProps<'button'>)
  )

function getPaginationLinkClassName({
  className,
  isActive,
  size = 'icon',
}: {
  className?: string
  isActive?: boolean
  size?: VariantProps<typeof buttonVariants>['size']
}) {
  return cn(
    'touch-manipulation min-h-11 min-w-11',
    buttonVariants({ variant: isActive ? 'outline' : 'ghost', size }),
    className,
  )
}

function getPaginationLinkSharedProps({
  ariaLabel,
  className,
  isActive,
  size,
}: {
  ariaLabel?: string
  className?: string
  isActive?: boolean
  size?: VariantProps<typeof buttonVariants>['size']
}) {
  return {
    'aria-label': ariaLabel,
    'aria-current': isActive ? 'page' : undefined,
    'data-slot': 'pagination-link',
    'data-active': isActive,
    'data-interactive-transition': 'true',
    className: getPaginationLinkClassName({ className, isActive, size }),
  } as const
}

function PaginationLink(props: PaginationLinkProps) {
  if (props.href !== undefined) {
    const {
      className,
      isActive,
      size = 'icon',
      children,
      'aria-label': ariaLabel,
      ...anchorProps
    } = props
    return (
      <a
        {...getPaginationLinkSharedProps({
          ariaLabel,
          className,
          isActive,
          size,
        })}
        {...anchorProps}
      >
        {children}
      </a>
    )
  }

  const {
    className,
    isActive,
    size = 'icon',
    children,
    'aria-label': ariaLabel,
    ...buttonProps
  } = props
  return (
    <button
      type="button"
      {...getPaginationLinkSharedProps({
        ariaLabel,
        className,
        isActive,
        size,
      })}
      {...buttonProps}
    >
      {children}
    </button>
  )
}

function PaginationPrevious({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      size="default"
      className={cn('pl-2!', className)}
      {...props}
    >
      <ChevronLeftIcon data-icon="inline-start" />
      <span className="hidden sm:block">Previous</span>
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      size="default"
      className={cn('pr-2!', className)}
      {...props}
    >
      <span className="hidden sm:block">Next</span>
      <ChevronRightIcon data-icon="inline-end" />
    </PaginationLink>
  )
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(
        "min-h-11 min-w-11 items-center justify-center [&_svg:not([class*='size-'])]:size-4 flex items-center justify-center",
        className,
      )}
      {...props}
    >
      <MoreHorizontalIcon aria-hidden="true" />
      <span className="sr-only">More pages</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
