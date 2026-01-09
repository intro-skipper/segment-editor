/**
 * PageSizeSection Component
 *
 * Items per page selection settings section.
 *
 * @module components/settings/sections/PageSizeSection
 */

import { useCallback, useMemo } from 'react'
import { Settings2 } from 'lucide-react'

import { SelectSettingsSection } from '../primitives'
import type { SelectOption } from '../primitives'
import type { PageSize } from '@/stores/session-store'
import { PAGE_SIZE_OPTIONS, useSessionStore } from '@/stores/session-store'

export function PageSizeSection() {
  const pageSize = useSessionStore((s) => s.pageSize)
  const setPageSize = useSessionStore((s) => s.setPageSize)

  const options = useMemo<Array<SelectOption>>(
    () =>
      PAGE_SIZE_OPTIONS.map((size) => ({
        value: String(size),
        label: String(size),
      })),
    [],
  )

  const handleChange = useCallback(
    (value: string) => {
      if (value) setPageSize(Number(value) as PageSize)
    },
    [setPageSize],
  )

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
