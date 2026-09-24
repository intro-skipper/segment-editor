/**
 * Error Boundary component for catching and displaying React errors.
 * Provides a fallback UI when child components throw errors.
 */

import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import type { ErrorInfo, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { ErrorCard } from '@/components/ui/error-card'
import { logError } from '@/lib/unified-error'

export interface ErrorBoundaryProps {
  /** Child components to wrap */
  children: ReactNode
  /** Custom fallback UI; the function form receives a reset that re-renders the children. */
  fallback?: ReactNode | ((reset: () => void) => ReactNode)
  /** Component name for error logging context */
  componentName?: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

/**
 * Error Boundary catches JavaScript errors anywhere in their child component tree.
 * Logs errors and displays a fallback UI instead of crashing the whole app.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error using centralized error logger
    logError(error, errorInfo, {
      component: this.props.componentName ?? 'ErrorBoundary',
      severity: 'high',
    })

    // Update state with error details
    this.setState({ errorInfo })
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const { fallback } = this.props
      if (typeof fallback === 'function') return fallback(this.handleRetry)
      if (fallback) return fallback

      return (
        <ErrorCard
          icon={<AlertTriangle />}
          title="Something went wrong"
          description="An unexpected error occurred. This has been logged and we'll look into it."
          actions={
            <>
              <Button onClick={this.handleRetry} variant="outline">
                <RefreshCw className="size-4" aria-hidden="true" />
                Try Again
              </Button>
              <Button onClick={this.handleReload}>Reload Page</Button>
            </>
          }
        >
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details className="mb-4 rounded-lg border bg-muted/50 p-3 text-left">
              <summary className="cursor-pointer text-sm font-medium">
                Error Details
              </summary>
              <pre className="mt-2 overflow-auto text-xs text-muted-foreground">
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </ErrorCard>
      )
    }

    return this.props.children
  }
}
