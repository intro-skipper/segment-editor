import type { ComponentProps, ReactNode } from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { IconDisc } from '@/components/ui/icon-disc'

interface ErrorCardProps {
  icon: ReactNode
  tone?: ComponentProps<typeof IconDisc>['tone']
  title: ReactNode
  description: ReactNode
  /** Buttons and links, stacked on phones and in a row from `sm` up. */
  actions: ReactNode
  /** Extra content above the actions, such as developer error details. */
  children?: ReactNode
}

/**
 * Full-page state card for errors and dead ends: an icon disc, a title, a
 * description and a row of actions, centered in the space the parent flex
 * column leaves it. Announces itself as an alert.
 */
export function ErrorCard({
  icon,
  tone = 'destructive',
  title,
  description,
  actions,
  children,
}: ErrorCardProps) {
  return (
    <div
      className="flex flex-1 items-center justify-center p-4"
      role="alert"
      aria-live="assertive"
    >
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <IconDisc tone={tone} size="lg" className="mx-auto mb-2">
            {icon}
          </IconDisc>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {children}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            {actions}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
