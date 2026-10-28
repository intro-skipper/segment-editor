import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Palette } from 'lucide-react'

import { SettingsSection } from '../primitives/SettingsSection'
import { SettingsSelect } from '../primitives/SettingsSelect'
import type { SelectOption } from '../primitives/SettingsSelect'
import type { Theme } from '@/stores/app-store'
import { useAppStore } from '@/stores/app-store'

type ColorModeValue = 'color' | 'monochrome'

export function AppearanceSection() {
  const { t } = useTranslation()
  const descriptionId = useId()
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const monochrome = useAppStore((s) => s.monochrome)
  const setMonochrome = useAppStore((s) => s.setMonochrome)

  const options: Array<SelectOption<Theme>> = [
    { value: 'auto', label: t('app.theme.system') },
    { value: 'dark', label: t('app.theme.dark') },
    { value: 'light', label: t('app.theme.light') },
  ]
  const title = t('app.theme.title')
  const monochromeLabel = t('app.theme.monochrome')
  const colorModeOptions: Array<SelectOption<ColorModeValue>> = [
    { value: 'color', label: t('app.theme.color') },
    { value: 'monochrome', label: monochromeLabel },
  ]

  return (
    <SettingsSection icon={Palette} title={title}>
      <div className="flex flex-col gap-2">
        <SettingsSelect
          value={theme}
          onValueChange={setTheme}
          options={options}
          aria-label={title}
        />
        <SettingsSelect
          value={monochrome ? 'monochrome' : 'color'}
          onValueChange={(value) => {
            setMonochrome(value === 'monochrome')
          }}
          options={colorModeOptions}
          aria-label={t('app.theme.colorMode')}
          aria-describedby={descriptionId}
        />
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {t('app.theme.monochromeDescription')}
        </p>
      </div>
    </SettingsSection>
  )
}
