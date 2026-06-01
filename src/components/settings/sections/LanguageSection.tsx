import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'

import { SelectSettingsSection } from '../primitives/SelectSettingsSection'
import type { SelectOption } from '../primitives/SettingsSelect'
import type { Locale } from '@/stores/app-store'
import { getEffectiveLocale, useAppStore } from '@/stores/app-store'

export function LanguageSection() {
  const { t, i18n } = useTranslation()
  const locale = useAppStore((s) => s.locale)
  const setLocale = useAppStore((s) => s.setLocale)

  const options: Array<SelectOption<Locale>> = [
    { value: 'auto', label: t('app.locale.auto') },
    { value: 'en-US', label: t('app.locale.en-US') },
    { value: 'de', label: t('app.locale.de') },
    { value: 'fr', label: t('app.locale.fr') },
  ]

  const handleChange = (value: Locale) => {
    setLocale(value)
    void i18n.changeLanguage(getEffectiveLocale(value))
  }

  return (
    <SelectSettingsSection
      icon={Globe}
      titleKey="app.locale.title"
      value={locale}
      onValueChange={handleChange}
      options={options}
    />
  )
}
