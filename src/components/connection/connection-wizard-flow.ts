export type WizardStep = 'entry' | 'select' | 'auth' | 'success'

const STEP_ORDER: Array<WizardStep> = ['entry', 'select', 'auth', 'success']

export function getPreviousStep(currentStep: WizardStep): WizardStep | null {
  const currentIndex = STEP_ORDER.indexOf(currentStep)
  if (currentIndex <= 0) return null
  return STEP_ORDER[currentIndex - 1] ?? null
}

export function canGoBack(step: WizardStep): boolean {
  return step !== 'entry' && step !== 'success'
}
