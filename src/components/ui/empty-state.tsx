import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: React.ReactNode
  message: string
  className?: string
}

export function EmptyState({ icon, message, className }: EmptyStateProps) {
  return (
    <output
      className={cn(
        'py-12 flex flex-col items-center justify-center gap-4 text-center text-muted-foreground',
        className,
      )}
      aria-live="polite"
    >
      {icon && (
        <div className="opacity-40" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="text-lg">{message}</p>
    </output>
  )
}
