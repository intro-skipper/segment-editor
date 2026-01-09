/**
 * AppearanceSection Component
 *
 * Theme selection settings section.
 *
 * @module components/settings/sections/AppearanceSection
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Palette } from 'lucide-react'

import { SelectSettingsSection } from '../primitives'
import type { SelectOption } from '../primitives'
import type { Theme } from '@/stores/app-store'
import { useAppStore } from '@/stores/app-store'

export function AppearanceSection() {
  const { t } = useTranslation()
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)

  const options = useMemo<Array<SelectOption<Theme>>>(
    () => [
      { value: 'auto', label: t('app.theme.system') },
      { value: 'dark', label: t('app.theme.dark') },
      { value: 'light', label: t('app.theme.light') },
    ],
    [t],
  )

  return (
    <SelectSettingsSection
      icon={Palette}
      titleKey="app.theme.title"
      value={theme}
      onValueChange={setTheme}
      options={options}
    />
  )
}
