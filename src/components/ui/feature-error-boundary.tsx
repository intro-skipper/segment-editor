/**
 * FeatureErrorBoundary - Specialized error boundary for major feature areas.
 * Provides a user-friendly fallback UI that doesn't crash the entire app.
 */

import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AlertCircle, ArrowLeft, Home, RefreshCw } from 'lucide-react'

import type { ReactNode } from 'react'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export interface FeatureErrorBoundaryProps {
  /** Child components to wrap */
  children: ReactNode
  /** Feature name for error logging and display */
  featureName: string
  /** Minimum height class for the fallback UI */
  minHeightClass?: string
  /** Whether to show navigation options */
  showNavigation?: boolean
  /** Custom error message */
  errorMessage?: string
}

/**
 * Fallback UI component for feature errors.
 * Provides retry, back, and home navigation options.
 */
function FeatureErrorFallback({
  featureName,
  minHeightClass = 'min-h-[var(--spacing-page-min-height-sm)]',
  showNavigation = true,
  errorMessage,
  onRetry,
}: {
  featureName: string
  minHeightClass?: string
  showNavigation?: boolean
  errorMessage?: string
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const handleGoBack = useCallback(() => {
    navigate({ to: '/' })
  }, [navigate])

  const handleGoHome = useCallback(() => {
    navigate({ to: '/' })
  }, [navigate])

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
            {t('error.feature_error', {
              feature: featureName,
              defaultValue: `${featureName} Error`,
            })}
          </CardTitle>
          <CardDescription>
            {errorMessage ||
              t(
                'error.feature_description',
                'This feature encountered an error. You can try again or navigate elsewhere.',
              )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button variant="outline" onClick={onRetry}>
            <RefreshCw className="size-4" aria-hidden="true" />
            {t('common.retry', 'Try Again')}
          </Button>
          {showNavigation && (
            <>
              <Button variant="outline" onClick={handleGoBack}>
                <ArrowLeft className="size-4" aria-hidden="true" />
                {t('common.go_back', 'Go Back')}
              </Button>
              <Button onClick={handleGoHome}>
                <Home className="size-4" aria-hidden="true" />
                {t('common.home', 'Home')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * FeatureErrorBoundary wraps major feature areas with error handling.
 * Provides a user-friendly fallback that allows recovery without page reload.
 */
export function FeatureErrorBoundary({
  children,
  featureName,
  minHeightClass,
  showNavigation = true,
  errorMessage,
}: FeatureErrorBoundaryProps) {
  return (
    <ErrorBoundary
      componentName={featureName}
      fallback={
        <FeatureErrorFallback
          featureName={featureName}
          minHeightClass={minHeightClass}
          showNavigation={showNavigation}
          errorMessage={errorMessage}
          onRetry={() => window.location.reload()}
        />
      }
    >
      {children}
    </ErrorBoundary>
  )
}

export default FeatureErrorBoundary
