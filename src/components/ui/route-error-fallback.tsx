import { Link, useCanGoBack, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AlertCircle, ArrowLeft, Home, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { ErrorCard } from '@/components/ui/error-card'

interface RouteErrorFallbackProps {
  title?: string
  message?: string
  showRetry?: boolean
  showNavigation?: boolean
  /** Retry handler; defaults to invalidating the router, which also resets route error boundaries. */
  onRetry?: () => void
}

/** Error card with router-aware actions: back, retry and home. */
export function RouteErrorFallback({
  title,
  message,
  showRetry = true,
  showNavigation = true,
  onRetry,
}: RouteErrorFallbackProps) {
  const { t } = useTranslation()
  const canGoBack = useCanGoBack()
  const router = useRouter()

  const retry = onRetry ?? (() => void router.invalidate())

  return (
    <ErrorCard
      icon={<AlertCircle />}
      title={title ?? t('error.something_went_wrong', 'Something went wrong')}
      description={
        message ||
        t(
          'error.generic_description',
          'An unexpected error occurred. Please try again.',
        )
      }
      actions={
        <>
          {showNavigation && canGoBack && (
            <Button variant="outline" onClick={() => router.history.back()}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              {t('common.go_back', 'Go Back')}
            </Button>
          )}
          {showRetry && (
            <Button variant="outline" onClick={retry}>
              <RefreshCw className="size-4" aria-hidden="true" />
              {t('common.retry', 'Retry')}
            </Button>
          )}
          {showNavigation && (
            <Link to="/" className={buttonVariants()}>
              <Home className="size-4" aria-hidden="true" />
              {t('common.home', 'Home')}
            </Link>
          )}
        </>
      }
    />
  )
}
