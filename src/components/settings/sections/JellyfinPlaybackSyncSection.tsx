import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Radio } from 'lucide-react'

import { SettingsSection } from '../primitives/SettingsSection'
import { SettingsSelect } from '../primitives/SettingsSelect'
import type { SelectOption } from '../primitives/SettingsSelect'
import { useAppStore } from '@/stores/app-store'

type PlaybackSyncValue = 'enabled' | 'disabled'

export function JellyfinPlaybackSyncSection() {
  const { t } = useTranslation()
  const descriptionId = useId()
  const jellyfinPlaybackSyncEnabled = useAppStore(
    (s) => s.jellyfinPlaybackSyncEnabled,
  )
  const setJellyfinPlaybackSyncEnabled = useAppStore(
    (s) => s.setJellyfinPlaybackSyncEnabled,
  )

  const title = t('settings.jellyfinPlaybackSync.title')
  const options: Array<SelectOption<PlaybackSyncValue>> = [
    {
      value: 'disabled',
      label: t('settings.jellyfinPlaybackSync.disabled'),
    },
    {
      value: 'enabled',
      label: t('settings.jellyfinPlaybackSync.enabled'),
    },
  ]

  return (
    <SettingsSection icon={Radio} title={title}>
      <div className="space-y-2">
        <SettingsSelect
          value={jellyfinPlaybackSyncEnabled ? 'enabled' : 'disabled'}
          onValueChange={(value) => {
            setJellyfinPlaybackSyncEnabled(value === 'enabled')
          }}
          options={options}
          aria-label={title}
          aria-describedby={descriptionId}
        />
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {t('settings.jellyfinPlaybackSync.description')}
        </p>
      </div>
    </SettingsSection>
  )
}
