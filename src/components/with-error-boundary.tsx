/**
 * Higher-order component to wrap any component with error boundary.
 */

import { ErrorBoundary } from './ErrorBoundary'
import type { ErrorBoundaryProps } from './ErrorBoundary'

export function withErrorBoundary<TProps extends object>(
  WrappedComponent: React.ComponentType<TProps>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>,
) {
  return function WithErrorBoundaryWrapper(props: TProps) {
    return (
      <ErrorBoundary {...errorBoundaryProps}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    )
  }
}
