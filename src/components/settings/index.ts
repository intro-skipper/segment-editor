/**
 * Settings Components
 *
 * Modular settings dialog with separated concerns.
 *
 * @module components/settings
 */

export { SettingsDialog } from './SettingsDialog'

// Re-export primitives for external reuse
export {
  SettingsSection,
  SettingsSelect,
  SelectSettingsSection,
} from './primitives'
export type {
  SettingsSectionProps,
  SettingsSelectProps,
  SelectOption,
  SelectSettingsSectionProps,
} from './primitives'
