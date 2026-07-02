import { useTranslation } from 'react-i18next'
import { Palette } from 'lucide-react'

import { SettingsSection } from '../primitives/SettingsSection'
import { SettingsSelect } from '../primitives/SettingsSelect'
import type { SelectOption } from '../primitives/SettingsSelect'
import type { Theme } from '@/stores/app-store'
import { useAppStore } from '@/stores/app-store'
import { cn } from '@/lib/utils'

export function AppearanceSection() {
  const { t } = useTranslation()
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
  const monochromeDescription = t('app.theme.monochromeDescription')

  return (
    <SettingsSection icon={Palette} title={title}>
      <div className="space-y-3">
        <SettingsSelect
          value={theme}
          onValueChange={setTheme}
          options={options}
          aria-label={title}
        />
        <button
          type="button"
          aria-pressed={monochrome}
          onClick={() => setMonochrome(!monochrome)}
          className={cn(
            'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-[background-color,border-color,color,box-shadow]',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none',
            monochrome
              ? 'border-primary/40 bg-primary/10 text-foreground'
              : 'border-border/70 bg-input/20 hover:bg-muted/50',
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Palette className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block font-medium">{monochromeLabel}</span>
              <span className="block text-xs text-muted-foreground">
                {monochromeDescription}
              </span>
            </span>
          </span>
          <span
            aria-hidden="true"
            className={cn(
              'relative h-5 w-9 shrink-0 rounded-full border transition-colors',
              monochrome
                ? 'border-primary bg-primary'
                : 'border-border bg-muted',
            )}
          >
            <span
              className={cn(
                'absolute top-1/2 size-4 -translate-y-1/2 rounded-full bg-background shadow-sm transition-transform',
                monochrome ? 'translate-x-4' : 'translate-x-0.5',
              )}
            />
          </span>
        </button>
      </div>
    </SettingsSection>
  )
}
