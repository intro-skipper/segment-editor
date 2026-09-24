import type { ReactNode } from 'react'

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from './empty'
import { IconDisc } from './icon-disc'

interface EmptyStateProps {
  /** Decorative icon, shown in an IconDisc. */
  icon: ReactNode
  title?: string
  message: string
  /** `destructive` marks a failure: red disc, announced as an alert. */
  tone?: 'muted' | 'destructive'
  /** Optional call to action, such as a retry button. */
  action?: ReactNode
}

/**
 * The one placeholder for a view or list that has nothing to show, is still
 * connecting, or failed to load. Announced politely, or assertively for errors.
 */
export function EmptyState({
  icon,
  title,
  message,
  tone = 'muted',
  action,
}: EmptyStateProps) {
  return (
    <Empty role={tone === 'destructive' ? 'alert' : 'status'}>
      <EmptyHeader>
        <EmptyMedia>
          <IconDisc tone={tone}>{icon}</IconDisc>
        </EmptyMedia>
        {title && <EmptyTitle>{title}</EmptyTitle>}
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}
