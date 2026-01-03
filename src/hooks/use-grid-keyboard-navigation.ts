/**
 * useGridKeyboardNavigation - Hook for keyboard navigation in grid layouts.
 * Enables arrow key navigation, Home/End support, and proper focus management.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseGridKeyboardNavigationOptions {
  itemCount: number
  columns: number
  enabled?: boolean
  onActivate?: (index: number) => void
}

export interface GridProps {
  role: 'grid'
  'aria-label': string
  tabIndex: number
  onKeyDown: (e: React.KeyboardEvent) => void
  onFocus: () => void
}

export interface GridItemProps {
  role: 'gridcell'
  tabIndex: number
  'data-grid-index': number
  'aria-selected': boolean
  onFocus: () => void
}

export interface UseGridKeyboardNavigationReturn {
  focusedIndex: number
  setFocusedIndex: (index: number) => void
  gridProps: GridProps
  getItemProps: (index: number) => GridItemProps
  gridRef: React.RefObject<HTMLDivElement | null>
}

/** Navigation key handlers mapped to index calculations */
const NAV_KEYS: Partial<
  Record<
    string,
    (cur: number, cols: number, count: number, ctrl: boolean) => number
  >
> = {
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
}

export function useGridKeyboardNavigation({
  itemCount,
  columns,
  enabled = true,
  onActivate,
}: UseGridKeyboardNavigationOptions): UseGridKeyboardNavigationReturn {
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const gridRef = useRef<HTMLDivElement | null>(null)

  // Reset focus when items change
  useEffect(() => {
    if (itemCount === 0) setFocusedIndex(-1)
    else if (focusedIndex >= itemCount) setFocusedIndex(itemCount - 1)
  }, [itemCount, focusedIndex])

  // Focus the item element when focusedIndex changes
  useEffect(() => {
    if (!enabled || focusedIndex < 0 || !gridRef.current) return
    const item = gridRef.current.querySelector<HTMLElement>(
      `[data-grid-index="${focusedIndex}"]`,
    )
    if (item && document.activeElement !== item) item.focus()
  }, [focusedIndex, enabled])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!enabled || itemCount === 0) return

      if ((e.key === 'Enter' || e.key === ' ') && focusedIndex >= 0) {
        e.preventDefault()
        onActivate?.(focusedIndex)
        return
      }

      const handler = NAV_KEYS[e.key]
      if (!handler) return

      const current = focusedIndex < 0 ? 0 : focusedIndex
      const newIndex = handler(current, columns, itemCount, e.ctrlKey)

      if (newIndex !== current) {
        e.preventDefault()
        setFocusedIndex(newIndex)
      }
    },
    [enabled, itemCount, focusedIndex, columns, onActivate],
  )

  const handleGridFocus = useCallback(() => {
    if (focusedIndex < 0 && itemCount > 0) setFocusedIndex(0)
  }, [focusedIndex, itemCount])

  const getItemProps = useCallback(
    (index: number): GridItemProps => ({
      role: 'gridcell',
      tabIndex: focusedIndex === index ? 0 : -1,
      'data-grid-index': index,
      'aria-selected': focusedIndex === index,
      onFocus: () => setFocusedIndex(index),
    }),
    [focusedIndex],
  )

  return {
    focusedIndex,
    setFocusedIndex,
    gridProps: {
      role: 'grid',
      'aria-label': 'Media items grid',
      tabIndex: focusedIndex < 0 && itemCount > 0 ? 0 : -1,
      onKeyDown: handleKeyDown,
      onFocus: handleGridFocus,
    },
    getItemProps,
    gridRef,
  }
}
