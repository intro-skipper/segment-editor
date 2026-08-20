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
import {
  PAGE_SIZE_OPTIONS,
  PageSizeSchema,
  useSessionStore,
} from '@/stores/session-store'

export function PageSizeSection() {
  const pageSize = useSessionStore((s) => s.pageSize)
  const setPageSize = useSessionStore((s) => s.setPageSize)

  const options: Array<SelectOption> = PAGE_SIZE_OPTIONS.map((size) => ({
    value: String(size),
    label: String(size),
  }))

  const handleChange = (value: string) => {
    const parsed = PageSizeSchema.safeParse(Number(value))
    if (parsed.success) {
      setPageSize(parsed.data)
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
