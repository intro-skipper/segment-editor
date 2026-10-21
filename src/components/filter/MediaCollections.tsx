/**
 * The two layouts a page of media items renders in: a list and a grid.
 * Keyboard navigation wiring comes from the parent's useGridKeyboardNavigation
 * so focus state stays in one place across layout switches.
 */

import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'
import type { BaseItemDto } from '@/types/jellyfin'
import type { useGridKeyboardNavigation } from '@/hooks/use-grid-keyboard-navigation'
import { MediaCard } from '@/components/filter/MediaCard'
import { MediaListRow } from '@/components/filter/MediaListRow'
import { getMediaItemLabel } from '@/components/filter/media-item-label'

const GRID_CLASS = 'grid grid-cols-media gap-fluid-md'
const LIST_CLASS = 'flex flex-col gap-3'

type GridNavigation = ReturnType<typeof useGridKeyboardNavigation>

interface MediaCollectionProps {
  items: Array<BaseItemDto>
  /** Attached to the navigable container, which keyboard navigation measures. */
  gridRef: Ref<HTMLDivElement>
  gridProps: GridNavigation['gridProps']
  getItemProps: GridNavigation['getItemProps']
}

export function MediaList({
  items,
  gridRef,
  gridProps,
  getItemProps,
  onActivate,
}: MediaCollectionProps & { onActivate: (item: BaseItemDto) => void }) {
  const { t } = useTranslation()

  return (
    <div
      ref={gridRef}
      className={LIST_CLASS}
      {...gridProps}
      aria-label={t('items.mediaList', {
        defaultValue: 'Media items',
      })}
    >
      {items.map((item, index) => (
        <MediaListRow
          key={item.Id}
          item={item}
          index={index}
          label={getMediaItemLabel(t, item)}
          onActivate={() => onActivate(item)}
          interactiveProps={getItemProps(index)}
        />
      ))}
    </div>
  )
}

export function MediaGrid({
  items,
  gridRef,
  gridProps,
  getItemProps,
}: MediaCollectionProps) {
  const { t } = useTranslation()

  return (
    <div
      ref={gridRef}
      className={GRID_CLASS}
      {...gridProps}
      aria-label={t('items.mediaGrid', {
        defaultValue: 'Media items',
      })}
    >
      {items.map((item, index) => (
        <div
          key={item.Id}
          style={{
            contentVisibility: 'auto',
            containIntrinsicSize: '0px auto 320px',
          }}
        >
          <MediaCard item={item} index={index} {...getItemProps(index)} />
        </div>
      ))}
    </div>
  )
}
