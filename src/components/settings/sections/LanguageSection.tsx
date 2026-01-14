/**
 * LanguageSection Component
 *
 * Locale/language selection settings section.
 *
 * @module components/settings/sections/LanguageSection
 */

import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'

import { SelectSettingsSection } from '../primitives'
import type { SelectOption } from '../primitives'
import type { Locale } from '@/stores/app-store'
import { getEffectiveLocale, useAppStore } from '@/stores/app-store'

export function LanguageSection() {
  const { t, i18n } = useTranslation()
  const locale = useAppStore((s) => s.locale)
  const setLocale = useAppStore((s) => s.setLocale)

  const options = useMemo<Array<SelectOption<Locale>>>(
    () => [
      { value: 'auto', label: t('app.locale.auto') },
      { value: 'en-US', label: t('app.locale.en-US') },
      { value: 'de', label: t('app.locale.de') },
      { value: 'fr', label: t('app.locale.fr') },
    ],
    [t],
  )

  const handleChange = useCallback(
    (value: Locale) => {
      setLocale(value)
      i18n.changeLanguage(getEffectiveLocale(value))
    },
    [setLocale, i18n],
  )

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
