/**
 * The three layouts a page of media items renders in: a list, a plain grid,
 * and a row-windowed grid for large pages. Keyboard navigation wiring comes
 * from the parent's useGridKeyboardNavigation so focus state stays in one
 * place across layout switches.
 */

import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'
import type { BaseItemDto } from '@/types/jellyfin'
import type { useGridKeyboardNavigation } from '@/hooks/use-grid-keyboard-navigation'
import { MediaCard } from '@/components/filter/MediaCard'
import { MediaListRow } from '@/components/filter/MediaListRow'
import { getMediaItemLabel } from '@/components/filter/media-item-label'

export const GRID_CLASS =
  'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6'
/** Estimated row height the virtualized grid positions rows by. */
export const GRID_ROW_ESTIMATE_PX = 360
const LIST_CLASS = 'flex flex-col gap-3'

type GridNavigation = ReturnType<typeof useGridKeyboardNavigation>

interface MediaCollectionProps {
  items: Array<BaseItemDto>
  /** Attached to the navigable container; a ref object or a callback ref. */
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
            containIntrinsicSize: '0 320px',
          }}
        >
          <MediaCard item={item} index={index} {...getItemProps(index)} />
        </div>
      ))}
    </div>
  )
}

/**
 * Row-windowed grid for large pages. The scroll container is handed back
 * through `gridRef` so the parent's virtual window and keyboard navigation
 * can measure and scroll it.
 */
export function VirtualizedMediaGrid({
  items,
  columns,
  rowIndexes,
  totalHeight,
  gridRef,
  gridProps,
  getItemProps,
}: MediaCollectionProps & {
  columns: number
  rowIndexes: ReadonlyArray<number>
  totalHeight: number
}) {
  const { t } = useTranslation()
  const rowCount = Math.ceil(items.length / columns)

  return (
    <div
      ref={gridRef}
      {...gridProps}
      aria-rowcount={rowCount}
      aria-label={t('items.mediaGrid', {
        defaultValue: 'Media items',
      })}
      className="max-h-[72vh] overflow-auto overscroll-contain pr-1"
    >
      <div
        style={{
          height: totalHeight,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowIndexes.map((rowIndex) => {
          const rowStartIndex = rowIndex * columns
          const rowItems = items.slice(rowStartIndex, rowStartIndex + columns)

          return (
            <div
              key={`grid-row-${rowIndex}`}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                width: '100%',
                transform: `translateY(${rowIndex * GRID_ROW_ESTIMATE_PX}px)`,
              }}
            >
              <div className={GRID_CLASS}>
                {rowItems.map((item, columnIndex) => {
                  const index = rowStartIndex + columnIndex
                  return (
                    <MediaCard
                      key={item.Id}
                      {...getItemProps(index)}
                      item={item}
                      index={index}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
