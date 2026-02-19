/**
 * StepIndicator Component
 *
 * Visual progress indicator for wizard steps.
 *
 * @module components/connection/StepIndicator
 */

import type { WizardStep } from './use-wizard-state'
import { cn } from '@/lib/utils'

const STEPS: Array<{ key: WizardStep; label: string }> = [
  { key: 'entry', label: 'Server' },
  { key: 'select', label: 'Select' },
  { key: 'auth', label: 'Login' },
  { key: 'success', label: 'Done' },
]

interface StepIndicatorProps {
  currentStep: WizardStep
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep)

  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {STEPS.map((step, index) => {
        const isActive = index === currentIndex
        const isCompleted = index < currentIndex

        return (
          <div key={step.key} className="flex items-center">
            <div
              className={cn(
                'size-2 rounded-full transition-[transform,background-color]',
                isActive && 'bg-primary scale-125',
                isCompleted && 'bg-primary/60',
                !isActive && !isCompleted && 'bg-muted-foreground/30',
              )}
              aria-label={`Step ${index + 1}: ${step.label}${isActive ? ' (current)' : ''}${isCompleted ? ' (completed)' : ''}`}
            />
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  'w-8 h-0.5 mx-1',
                  isCompleted ? 'bg-primary/60' : 'bg-muted-foreground/30',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
