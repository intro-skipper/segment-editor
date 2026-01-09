/**
 * Error Boundary component for catching and displaying React errors.
 * Provides a fallback UI when child components throw errors.
 */

import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import type { ErrorInfo, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { logError } from '@/lib/unified-error'

export interface ErrorBoundaryProps {
  /** Child components to wrap */
  children: ReactNode
  /** Custom fallback UI (optional) */
  fallback?: ReactNode
  /** Callback when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  /** Component name for error logging context */
  componentName?: string
  /** Whether to show a minimal fallback (for non-critical features) */
  minimal?: boolean
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

    // Call optional error callback
    this.props.onError?.(error, errorInfo)
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
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Minimal fallback for non-critical features
      if (this.props.minimal) {
        return (
          <div
            className="flex items-center justify-center p-4 text-muted-foreground"
            role="alert"
            aria-live="polite"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4" aria-hidden="true" />
              <span className="text-sm">Something went wrong</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={this.handleRetry}
                className="ml-2"
              >
                <RefreshCw className="size-3 mr-1" aria-hidden="true" />
                Retry
              </Button>
            </div>
          </div>
        )
      }

      // Default error UI
      return (
        <div
          className="flex min-h-[var(--spacing-error-min-height)] items-center justify-center p-4"
          role="alert"
          aria-live="assertive"
        >
          <Card className="w-full max-w-lg">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle
                  className="size-8 text-destructive"
                  aria-hidden="true"
                />
              </div>
              <CardTitle className="text-xl">Something went wrong</CardTitle>
              <CardDescription>
                An unexpected error occurred. This has been logged and we'll
                look into it.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Error details (development only) */}
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="rounded-lg border bg-muted/50 p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Error Details
                  </summary>
                  <pre className="mt-2 overflow-auto text-xs text-muted-foreground">
                    {this.state.error.toString()}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </details>
              )}

              {/* Action buttons */}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Button onClick={this.handleRetry} variant="outline">
                  <RefreshCw className="mr-2 size-4" aria-hidden="true" />
                  Try Again
                </Button>
                <Button onClick={this.handleReload}>Reload Page</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}

// Re-export HOC for backward compatibility
export { withErrorBoundary } from './with-error-boundary'

export default ErrorBoundary
