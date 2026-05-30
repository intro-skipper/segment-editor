import { Link, useCanGoBack, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AlertCircle, ArrowLeft, Home, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface RouteErrorFallbackProps {
  message?: string
  showRetry?: boolean
  onRetry?: () => void
  minHeightClass?: string
}

export function RouteErrorFallback({
  message,
  showRetry = true,
  onRetry,
  minHeightClass = 'min-h-[var(--spacing-page-min-height-sm)]',
}: RouteErrorFallbackProps) {
  const { t } = useTranslation()
  const canGoBack = useCanGoBack()
  const router = useRouter()

  const handleRetry = () => {
    if (onRetry) {
      onRetry()
    } else {
      void router.invalidate()
    }
  }

  return (
    <div
      className={`flex items-center justify-center p-4 ${minHeightClass}`}
      role="alert"
      aria-live="assertive"
    >
      <Card className="w-full max-w-md text-center">
        <CardHeader className="space-y-4">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle
              className="size-8 text-destructive"
              aria-hidden="true"
            />
          </div>
          <CardTitle className="text-xl">
            {t('error.something_went_wrong', 'Something went wrong')}
          </CardTitle>
          <CardDescription>
            {message ||
              t(
                'error.generic_description',
                'An unexpected error occurred. Please try again.',
              )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          {canGoBack && (
            <Button variant="outline" onClick={() => router.history.back()}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              {t('common.go_back', 'Go Back')}
            </Button>
          )}
          {showRetry && (
            <Button variant="outline" onClick={handleRetry}>
              <RefreshCw className="size-4" aria-hidden="true" />
              {t('common.retry', 'Retry')}
            </Button>
          )}
          <Link to="/" className={buttonVariants()}>
            <Home className="size-4" aria-hidden="true" />
            {t('common.home', 'Home')}
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
