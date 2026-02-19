/**
 * RouteErrorFallback - Consistent error display for route-level errors.
 * Provides user-friendly error messages with retry and navigation options.
 */

import { useCallback } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AlertCircle, ArrowLeft, Home, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface RouteErrorFallbackProps {
  /** Error message to display */
  message?: string
  /** Whether to show retry button */
  showRetry?: boolean
  /** Custom retry handler */
  onRetry?: () => void
  /** Minimum height class */
  minHeightClass?: string
}

/**
 * Consistent error fallback for route-level errors.
 * Provides navigation options and optional retry functionality.
 */
export function RouteErrorFallback({
  message,
  showRetry = true,
  onRetry,
  minHeightClass = 'min-h-[var(--spacing-page-min-height-sm)]',
}: RouteErrorFallbackProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const router = useRouter()

  const handleGoBack = useCallback(() => {
    if (router.history.length > 1) {
      router.history.back()
    } else {
      navigate({ to: '/' })
    }
  }, [router.history, navigate])

  const handleGoHome = useCallback(() => {
    navigate({ to: '/' })
  }, [navigate])

  const handleRetry = useCallback(() => {
    if (onRetry) {
      onRetry()
    } else {
      void router.invalidate()
    }
  }, [onRetry, router])

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
          <Button variant="outline" onClick={handleGoBack}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t('common.go_back', 'Go Back')}
          </Button>
          {showRetry && (
            <Button variant="outline" onClick={handleRetry}>
              <RefreshCw className="size-4" aria-hidden="true" />
              {t('common.retry', 'Retry')}
            </Button>
          )}
          <Button onClick={handleGoHome}>
            <Home className="size-4" aria-hidden="true" />
            {t('common.home', 'Home')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
