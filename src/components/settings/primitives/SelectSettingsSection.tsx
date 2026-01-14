/**
 * SelectSettingsSection Component
 *
 * Generic settings section with a select dropdown.
 * Reduces boilerplate across settings sections that follow the same pattern.
 *
 * @module components/settings/primitives/SelectSettingsSection
 */

import { useTranslation } from 'react-i18next'

import { SettingsSection } from './SettingsSection'
import { SettingsSelect } from './SettingsSelect'
import type { LucideIcon } from 'lucide-react'
import type { SelectOption } from './SettingsSelect'

export interface SelectSettingsSectionProps<T extends string = string> {
  /** Icon to display in the section header */
  icon: LucideIcon
  /** i18n key for the section title */
  titleKey: string
  /** Default title if translation is missing */
  defaultTitle?: string
  /** Current selected value */
  value: T
  /** Callback when value changes */
  onValueChange: (value: T) => void
  /** Available options */
  options: Array<SelectOption<T>>
  /** Optional badge to display in header */
  badge?: React.ReactNode
}

/**
 * Generic settings section with select dropdown.
 * Handles translation and accessibility automatically.
 */
export function SelectSettingsSection<T extends string = string>({
  icon,
  titleKey,
  defaultTitle,
  value,
  onValueChange,
  options,
  badge,
}: SelectSettingsSectionProps<T>) {
  const { t } = useTranslation()
  const title = t(titleKey, { defaultValue: defaultTitle ?? titleKey })

  return (
    <SettingsSection icon={icon} title={title} badge={badge}>
      <SettingsSelect
        value={value}
        onValueChange={onValueChange}
        options={options}
        aria-label={title}
      />
    </SettingsSection>
  )
}
