/**
 * PageSizeSection Component
 *
 * Items per page selection settings section.
 *
 * @module components/settings/sections/PageSizeSection
 */

import { Settings2 } from 'lucide-react'

import { SelectSettingsSection } from '../primitives/SelectSettingsSection'
import type { SelectOption } from '../primitives/SettingsSelect'
import type { PageSize } from '@/stores/session-store'
import { PAGE_SIZE_OPTIONS, useSessionStore } from '@/stores/session-store'

function isPageSize(value: number): value is PageSize {
  return PAGE_SIZE_OPTIONS.includes(value as PageSize)
}

export function PageSizeSection() {
  const pageSize = useSessionStore((s) => s.pageSize)
  const setPageSize = useSessionStore((s) => s.setPageSize)

  const options: Array<SelectOption> = PAGE_SIZE_OPTIONS.map((size) => ({
    value: String(size),
    label: String(size),
  }))

  const handleChange = (value: string) => {
    const parsedValue = Number(value)
    if (Number.isFinite(parsedValue) && isPageSize(parsedValue)) {
      setPageSize(parsedValue)
    }
  }

  return (
    <SelectSettingsSection
      icon={Settings2}
      titleKey="items.perPage"
      defaultTitle="Items per page"
      value={String(pageSize)}
      onValueChange={handleChange}
      options={options}
    />
  )
}
