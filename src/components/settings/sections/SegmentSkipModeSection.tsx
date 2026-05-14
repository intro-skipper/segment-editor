import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { SkipForward } from 'lucide-react'

import { SelectSettingsSection } from '../primitives'
import type { SelectOption } from '../primitives'
import type { SegmentSkipMode } from '@/stores/app-store'
import { useAppStore } from '@/stores/app-store'

export function SegmentSkipModeSection() {
  const { t } = useTranslation()
  const segmentSkipMode = useAppStore((s) => s.segmentSkipMode)
  const setSegmentSkipMode = useAppStore((s) => s.setSegmentSkipMode)

  const options = useMemo<Array<SelectOption<SegmentSkipMode>>>(
    () => [
      {
        value: 'button',
        label: t('settings.segmentSkipMode.button'),
      },
      {
        value: 'auto',
        label: t('settings.segmentSkipMode.auto'),
      },
      {
        value: 'disabled',
        label: t('settings.segmentSkipMode.disabled'),
      },
    ],
    [t],
  )

  return (
    <SelectSettingsSection
      icon={SkipForward}
      titleKey="settings.segmentSkipMode.title"
      value={segmentSkipMode}
      onValueChange={setSegmentSkipMode}
      options={options}
    />
  )
}
