/**
 * useGridKeyboardNavigation - Hook for keyboard navigation in grid layouts.
 * Enables arrow key navigation, Home/End support, and proper focus management.
 * Attach `gridRef` to the item container: CSS decides the column count, and
 * the hook reads it from that container on each key press.
 */

import { useRef, useState } from 'react'

import { lookup } from '@/lib/utils'

interface UseGridKeyboardNavigationOptions {
  itemCount: number
  onActivate?: (index: number) => void
}

interface GridProps {
  role: 'grid'
  tabIndex: number
  onKeyDown: (e: React.KeyboardEvent) => void
  onFocus: () => void
}

interface GridItemProps {
  role: 'gridcell'
  tabIndex: number
  'data-grid-index': number
  'aria-selected': boolean
  onFocus: (e: React.FocusEvent<HTMLElement>) => void
}

interface UseGridKeyboardNavigationReturn {
  setFocusedIndex: (index: number) => void
  gridProps: GridProps
  getItemProps: (index: number) => GridItemProps
  gridRef: React.RefObject<HTMLDivElement | null>
}

/** Navigation key handlers mapped to index calculations */
const NAV_KEYS = {
  ArrowRight: (cur, _, count) => Math.min(cur + 1, count - 1),
  ArrowLeft: (cur) => Math.max(cur - 1, 0),
  ArrowDown: (cur, cols, count) => Math.min(cur + cols, count - 1),
  ArrowUp: (cur, cols) => Math.max(cur - cols, 0),
  Home: (cur, cols, _count, ctrl) => (ctrl ? 0 : Math.floor(cur / cols) * cols),
  End: (cur, cols, count, ctrl) =>
    ctrl
      ? count - 1
      : Math.min(Math.floor(cur / cols) * cols + cols - 1, count - 1),
  PageDown: (cur, cols, count) => Math.min(cur + cols * 3, count - 1),
  PageUp: (cur, cols) => Math.max(cur - cols * 3, 0),
} satisfies Record<
  string,
  (cur: number, cols: number, count: number, ctrl: boolean) => number
>

/** Track count of a CSS grid container; 1 for any other layout, such as a list. */
function countColumns(container: HTMLElement | null): number {
  if (!container) return 1
  const tracks = getComputedStyle(container).gridTemplateColumns
  return tracks && tracks !== 'none' ? tracks.split(' ').length : 1
}

export function useGridKeyboardNavigation({
  itemCount,
  onActivate,
}: UseGridKeyboardNavigationOptions): UseGridKeyboardNavigationReturn {
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const gridRef = useRef<HTMLDivElement | null>(null)

  // Clamp stored index to valid range — used for all rendering and comparisons.
  const validFocusedIndex =
    itemCount === 0
      ? -1
      : focusedIndex >= itemCount
        ? itemCount - 1
        : focusedIndex

  const focusIndex = (index: number) => {
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-grid-index="${index}"]`)
      ?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (itemCount === 0) return

    if ((e.key === 'Enter' || e.key === ' ') && validFocusedIndex >= 0) {
      e.preventDefault()
      onActivate?.(validFocusedIndex)
      return
    }

    const handler = lookup(NAV_KEYS, e.key)
    if (!handler) return

    const current = validFocusedIndex < 0 ? 0 : validFocusedIndex
    const newIndex = handler(
      current,
      countColumns(gridRef.current),
      itemCount,
      e.ctrlKey || e.metaKey,
    )

    if (newIndex !== current) {
      e.preventDefault()
      setFocusedIndex(newIndex)
      focusIndex(newIndex)
    }
  }

  const handleGridFocus = () => {
    if (validFocusedIndex < 0 && itemCount > 0) {
      setFocusedIndex(0)
      focusIndex(0)
    }
  }

  const handleItemFocus = (e: React.FocusEvent<HTMLElement>) => {
    const indexAttribute = e.currentTarget.dataset.gridIndex
    if (!indexAttribute) return

    const nextIndex = Number.parseInt(indexAttribute, 10)
    if (Number.isNaN(nextIndex)) return

    setFocusedIndex(nextIndex)
  }

  const getItemProps = (index: number): GridItemProps => ({
    role: 'gridcell',
    tabIndex: validFocusedIndex === index ? 0 : -1,
    'data-grid-index': index,
    'aria-selected': validFocusedIndex === index,
    onFocus: handleItemFocus,
  })

  return {
    setFocusedIndex,
    gridProps: {
      role: 'grid',
      tabIndex: validFocusedIndex < 0 && itemCount > 0 ? 0 : -1,
      onKeyDown: handleKeyDown,
      onFocus: handleGridFocus,
    },
    getItemProps,
    gridRef,
  }
}
