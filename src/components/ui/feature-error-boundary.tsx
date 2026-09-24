import { useTranslation } from 'react-i18next'

import type { ReactNode } from 'react'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { RouteErrorFallback } from '@/components/ui/route-error-fallback'

interface FeatureErrorBoundaryProps {
  children: ReactNode
  featureName: string
  showNavigation?: boolean
}

function FeatureErrorFallback({
  featureName,
  showNavigation,
  onRetry,
}: Omit<FeatureErrorBoundaryProps, 'children'> & { onRetry: () => void }) {
  const { t } = useTranslation()

  return (
    <RouteErrorFallback
      title={t('error.feature_error', {
        feature: featureName,
        defaultValue: `${featureName} Error`,
      })}
      message={t(
        'error.feature_description',
        'This feature encountered an error. You can try again or navigate elsewhere.',
      )}
      showNavigation={showNavigation}
      onRetry={onRetry}
    />
  )
}

/** Error boundary whose fallback names the feature and offers retry and navigation. */
export function FeatureErrorBoundary({
  children,
  featureName,
  showNavigation = true,
}: FeatureErrorBoundaryProps) {
  return (
    <ErrorBoundary
      componentName={featureName}
      fallback={(reset) => (
        <FeatureErrorFallback
          featureName={featureName}
          showNavigation={showNavigation}
          onRetry={reset}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  )
}
