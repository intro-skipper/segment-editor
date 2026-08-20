import { LayoutList } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { SelectSettingsSection } from '../primitives/SelectSettingsSection'
import type { SelectOption } from '../primitives/SettingsSelect'
import {
  VIEW_MODE_OPTIONS,
  ViewModeSchema,
  useSessionStore,
} from '@/stores/session-store'

export function ViewModeSection() {
  const { t } = useTranslation()
  const viewMode = useSessionStore((s) => s.viewMode)
  const setViewMode = useSessionStore((s) => s.setViewMode)

  const options: Array<SelectOption> = VIEW_MODE_OPTIONS.map((mode) => ({
    value: mode,
    label: t(`app.viewMode.${mode}`),
  }))

  /** Base UI's onValueChange is untyped at runtime, so validate before storing. */
  const handleChange = (value: string) => {
    const parsed = ViewModeSchema.safeParse(value)
    if (parsed.success) {
      setViewMode(parsed.data)
    }
  }

  return (
    <SelectSettingsSection
      icon={LayoutList}
      titleKey="app.viewMode.title"
      defaultTitle="Browse layout"
      value={viewMode}
      onValueChange={handleChange}
      options={options}
    />
  )
}
