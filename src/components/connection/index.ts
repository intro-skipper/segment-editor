/**
 * Connection Components
 *
 * Public API for server discovery and authentication wizard.
 *
 * @module components/connection
 */

// Primary public API
export { ConnectionWizard } from './ConnectionWizard'
export type { ConnectionWizardProps } from './ConnectionWizard'

// Reusable components for external use
export { WizardError } from './WizardError'
export type { WizardErrorProps } from './WizardError'

// State management (for testing and advanced use cases)
export { useWizardState } from './use-wizard-state'
export type { WizardStep, WizardState } from './use-wizard-state'
