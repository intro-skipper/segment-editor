import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from './button'
import { cn } from '@/lib/utils'

interface ErrorStateProps {
  message: string
  onRetry?: () => void
  retryText?: string
  className?: string
}

export function ErrorState({
  message,
  onRetry,
  retryText = 'Retry',
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'py-6 flex flex-col items-center justify-center gap-3 text-muted-foreground',
        className,
      )}
      role="alert"
      aria-live="assertive"
    >
      <AlertCircle className="size-8 text-destructive" aria-hidden="true" />
      <p className="text-sm">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="size-4 mr-2" aria-hidden="true" />
          {retryText}
        </Button>
      )}
    </div>
  )
}
