/**
 * SegmentTypeMenu component.
 * Shared dropdown listing all segment types for creating a new segment.
 */

import { useTranslation } from 'react-i18next'

import type { MediaSegmentType } from '@/types/jellyfin'
import { SEGMENT_TYPES, getSegmentCssVar } from '@/lib/segment-utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface SegmentTypeMenuProps {
  /** Called with the chosen segment type */
  onSelect: (type: MediaSegmentType) => void
  /** Element rendered as the dropdown trigger (e.g. a Button) */
  render: React.ReactElement
  /** Trigger content (icon and/or label) */
  children?: React.ReactNode
  align?: 'start' | 'end' | 'center'
  /** Container element for the dropdown portal (needed for fullscreen) */
  container?: React.RefObject<HTMLElement | null>
}

export function SegmentTypeMenu({
  onSelect,
  render,
  children,
  align = 'start',
  container,
}: SegmentTypeMenuProps) {
  const { t } = useTranslation()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={render}>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} container={container}>
        {SEGMENT_TYPES.map((type) => (
          <DropdownMenuItem key={type} onClick={() => onSelect(type)}>
            <span
              className="size-3 rounded-full"
              style={{ backgroundColor: getSegmentCssVar(type) }}
              aria-hidden="true"
            />
            {t(`segmentType.${type}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
