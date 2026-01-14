/**
 * ProviderSection Component
 *
 * Segment provider selection settings section.
 *
 * @module components/settings/sections/ProviderSection
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Monitor } from 'lucide-react'

import { SelectSettingsSection } from '../primitives'
import type { SelectOption } from '../primitives'
import { useAppStore } from '@/stores/app-store'

const PROVIDER_IDS = [
  'SegmentEditor',
  'IntroSkipper',
  'ChapterSegments',
] as const
type ProviderId = (typeof PROVIDER_IDS)[number]

export function ProviderSection() {
  const { t } = useTranslation()
  const providerId = useAppStore((s) => s.providerId)
  const setProviderId = useAppStore((s) => s.setProviderId)

  const options = useMemo<Array<SelectOption<ProviderId>>>(
    () => [
      { value: 'SegmentEditor', label: t('provider.segment') },
      { value: 'IntroSkipper', label: t('provider.skipper') },
      { value: 'ChapterSegments', label: t('provider.chapter') },
    ],
    [t],
  )

  return (
    <SelectSettingsSection
      icon={Monitor}
      titleKey="provider.title"
      value={providerId as ProviderId}
      onValueChange={setProviderId}
      options={options}
    />
  )
}
