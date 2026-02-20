import { useCallback, useMemo, useSyncExternalStore } from 'react'

const EMPTY_RANGE_SNAPSHOT = '0|0'

interface UseVirtualWindowOptions<TElement extends HTMLElement> {
  enabled: boolean
  scrollElement: TElement | null
  itemCount: number
  itemSize: number
  overscan: number
}

interface VirtualWindowResult {
  totalSize: number
  startIndex: number
  endIndex: number
  indexes: Array<number>
}

export function useVirtualWindow<TElement extends HTMLElement>({
  enabled,
  scrollElement,
  itemCount,
  itemSize,
  overscan,
}: UseVirtualWindowOptions<TElement>): VirtualWindowResult {
  const normalizedItemCount = Math.max(0, itemCount)
  const normalizedItemSize = itemSize > 0 ? itemSize : 1
  const normalizedOverscan = Math.max(0, overscan)

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!enabled) {
        return () => {}
      }

      const element = scrollElement
      if (!element) {
        return () => {}
      }

      let frameId: number | null = null
      const flushStoreChange = () => {
        frameId = null
        onStoreChange()
      }

      const scheduleStoreChange = () => {
        if (frameId !== null) {
          return
        }

        frameId = window.requestAnimationFrame(flushStoreChange)
      }

      element.addEventListener('scroll', scheduleStoreChange, { passive: true })

      let resizeObserver: ResizeObserver | null = null
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(scheduleStoreChange)
        resizeObserver.observe(element)
      } else {
        window.addEventListener('resize', scheduleStoreChange)
      }

      scheduleStoreChange()

      return () => {
        element.removeEventListener('scroll', scheduleStoreChange)
        if (resizeObserver) {
          resizeObserver.disconnect()
        } else {
          window.removeEventListener('resize', scheduleStoreChange)
        }

        if (frameId !== null) {
          window.cancelAnimationFrame(frameId)
          frameId = null
        }
      }
    },
    [enabled, scrollElement],
  )

  const getSnapshot = useCallback(() => {
    if (!enabled || normalizedItemCount === 0) {
      return EMPTY_RANGE_SNAPSHOT
    }

    const element = scrollElement
    if (!element) {
      return EMPTY_RANGE_SNAPSHOT
    }

    const visibleItemCount =
      Math.ceil(element.clientHeight / normalizedItemSize) +
      normalizedOverscan * 2
    const startIndex = Math.max(
      0,
      Math.floor(element.scrollTop / normalizedItemSize) - normalizedOverscan,
    )
    const endIndex = Math.min(
      normalizedItemCount,
      startIndex + visibleItemCount,
    )

    return `${startIndex}|${endIndex}`
  }, [
    enabled,
    normalizedItemCount,
    normalizedItemSize,
    normalizedOverscan,
    scrollElement,
  ])

  const rangeSnapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => EMPTY_RANGE_SNAPSHOT,
  )

  const [startIndex, endIndex] = useMemo(() => {
    const [startIndexString, endIndexString] = rangeSnapshot.split('|')
    return [Number(startIndexString), Number(endIndexString)]
  }, [rangeSnapshot])

  const totalSize = normalizedItemCount * normalizedItemSize
  const indexes = useMemo(
    () =>
      Array.from(
        { length: Math.max(endIndex - startIndex, 0) },
        (_, offset) => startIndex + offset,
      ),
    [startIndex, endIndex],
  )

  return {
    totalSize,
    startIndex,
    endIndex,
    indexes,
  }
}
