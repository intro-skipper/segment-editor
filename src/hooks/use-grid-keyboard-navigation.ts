/**
 * useGridKeyboardNavigation - Hook for keyboard navigation in grid layouts.
 * Enables arrow key navigation, Home/End support, and proper focus management.
 * Supports virtualized grids via onScrollToIndex + retry-focus after scroll.
 */

import { useEffect, useRef, useState } from 'react'

interface UseGridKeyboardNavigationOptions {
  itemCount: number
  columns: number
  enabled?: boolean
  onActivate?: (index: number) => void
  /** Called when keyboard navigation targets an off-screen virtualized item.
   *  The consumer should scroll the item into view; focus will be retried after render. */
  onScrollToIndex?: (index: number) => void
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
  focusedIndex: number
  setFocusedIndex: (index: number) => void
  gridProps: GridProps
  getItemProps: (index: number) => GridItemProps
  gridRef: React.MutableRefObject<HTMLDivElement | null>
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

/** Max retry attempts to focus an element after scrolling it into view */
const FOCUS_RETRY_MAX = 5
/** Delay between retry attempts in ms (allows render after scroll) */
const FOCUS_RETRY_DELAY_MS = 60

export function useGridKeyboardNavigation({
  itemCount,
  columns,
  enabled = true,
  onActivate,
  onScrollToIndex,
}: UseGridKeyboardNavigationOptions): UseGridKeyboardNavigationReturn {
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const gridRef = useRef<HTMLDivElement | null>(null)
  /** Tracks a pending focus target for retry-after-scroll */
  const pendingFocusRef = useRef<number | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clamp stored index to valid range — used for all rendering and comparisons.
  const validFocusedIndex =
    itemCount === 0
      ? -1
      : focusedIndex >= itemCount
        ? itemCount - 1
        : focusedIndex

  /** Attempts to focus the DOM element at the given grid index.
   *  Returns true if focus succeeded. */
  const tryFocusElement = (index: number): boolean => {
    if (!enabled || index < 0 || !gridRef.current) return false
    const el = gridRef.current.querySelector<HTMLElement>(
      `[data-grid-index="${index}"]`,
    )
    if (el && document.activeElement !== el) {
      el.focus({ preventScroll: true })
      return true
    }
    return el !== null
  }

  /** Focuses the DOM element at the given grid index.
   *  For virtualized grids, scrolls and retries if element is not in DOM. */
  const focusIndex = (index: number) => {
    // Clear any pending retry
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
    pendingFocusRef.current = null

    if (tryFocusElement(index)) return

    // Element not in DOM — request scroll and schedule retries
    if (onScrollToIndex) {
      onScrollToIndex(index)
      pendingFocusRef.current = index

      let attempt = 0
      const retry = () => {
        attempt++
        if (pendingFocusRef.current !== index || attempt > FOCUS_RETRY_MAX) {
          pendingFocusRef.current = null
          return
        }
        if (tryFocusElement(index)) {
          pendingFocusRef.current = null
          return
        }
        retryTimerRef.current = setTimeout(retry, FOCUS_RETRY_DELAY_MS)
      }
      retryTimerRef.current = setTimeout(retry, FOCUS_RETRY_DELAY_MS)
    }
  }

  // Clean up retry timer on unmount
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
      }
    }
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!enabled || itemCount === 0) return

    if ((e.key === 'Enter' || e.key === ' ') && validFocusedIndex >= 0) {
      e.preventDefault()
      onActivate?.(validFocusedIndex)
      return
    }

    const handler = NAV_KEYS[e.key]
    if (!handler) return

    const current = validFocusedIndex < 0 ? 0 : validFocusedIndex
    const newIndex = handler(
      current,
      columns,
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
    focusedIndex: validFocusedIndex,
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
