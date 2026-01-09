/**
 * useAbortController Hook
 *
 * Manages AbortController lifecycle for async operations.
 * Automatically cancels previous requests when creating new ones.
 *
 * @module hooks/use-abort-controller
 */

import { useCallback, useRef } from 'react'

export interface UseAbortControllerReturn {
  /** Creates a new AbortController, cancelling any previous one */
  createController: () => AbortController
  /** Aborts the current controller and clears the reference */
  abort: () => void
  /** Returns true if there's an active (non-aborted) controller */
  isActive: () => boolean
}

/**
 * Hook for managing abort controller lifecycle.
 * Provides helpers to create new controllers while cancelling previous ones.
 *
 * @example
 * ```tsx
 * const { createController, abort } = useAbortController()
 *
 * const fetchData = async () => {
 *   const controller = createController()
 *   const result = await fetch(url, { signal: controller.signal })
 *   if (controller.signal.aborted) return
 *   // handle result
 * }
 *
 * useEffect(() => {
 *   return () => abort() // cleanup on unmount
 * }, [abort])
 * ```
 */
export function useAbortController(): UseAbortControllerReturn {
  const controllerRef = useRef<AbortController | null>(null)

  const createController = useCallback(() => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    return controller
  }, [])

  const abort = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
  }, [])

  const isActive = useCallback(() => {
    return (
      controllerRef.current !== null && !controllerRef.current.signal.aborted
    )
  }, [])

  return { createController, abort, isActive }
}
