import { ConnectionWizardContent } from './ConnectionWizardContent'
import { ErrorBoundary } from '@/components/ErrorBoundary'

export interface ConnectionWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete?: () => void
}

export function ConnectionWizard(props: ConnectionWizardProps) {
  return (
    <ErrorBoundary>
      <ConnectionWizardContent {...props} />
    </ErrorBoundary>
  )
}
