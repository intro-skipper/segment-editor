import { useMemo } from 'react'
import { LayoutList } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { SelectSettingsSection } from '../primitives'
import type { SelectOption } from '../primitives'
import type { ViewMode } from '@/stores/session-store'
import { VIEW_MODE_OPTIONS, useSessionStore } from '@/stores/session-store'

export function ViewModeSection() {
  const { t } = useTranslation()
  const viewMode = useSessionStore((s) => s.viewMode)
  const setViewMode = useSessionStore((s) => s.setViewMode)

  const options = useMemo<Array<SelectOption<ViewMode>>>(
    () =>
      VIEW_MODE_OPTIONS.map((mode) => ({
        value: mode,
        label: t(`app.viewMode.${mode}`),
      })),
    [t],
  )

  return (
    <SelectSettingsSection
      icon={LayoutList}
      titleKey="app.viewMode.title"
      defaultTitle="Browse view"
      value={viewMode}
      onValueChange={setViewMode}
      options={options}
    />
  )
}
