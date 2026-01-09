/**
 * SkipLink - Accessible skip navigation link for keyboard users.
 * Allows users to bypass repetitive navigation and jump to main content.
 * Visible only when focused (keyboard navigation).
 */

import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

export interface SkipLinkProps {
  /** Target element ID to skip to (without #) */
  targetId?: string
  /** Additional class names */
  className?: string
}

export function SkipLink({
  targetId = 'main-content',
  className,
}: SkipLinkProps) {
  const { t } = useTranslation()

  return (
    <a
      href={`#${targetId}`}
      className={cn(
        'skip-link',
        'sr-only focus:not-sr-only',
        'fixed top-0 left-4 z-[100]',
        'bg-primary text-primary-foreground',
        'px-4 py-2 rounded-b-lg',
        'font-medium text-sm',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        'transition-transform duration-200',
        '-translate-y-full focus:translate-y-0',
        className,
      )}
    >
      {t('accessibility.skipToMain', 'Skip to main content')}
    </a>
  )
}

export default SkipLink
