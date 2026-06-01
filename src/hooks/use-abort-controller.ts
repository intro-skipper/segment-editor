import { useRef } from 'react'

interface UseAbortControllerReturn {
  createController: () => AbortController
  abort: () => void
  isActive: () => boolean
}

export function useAbortController(): UseAbortControllerReturn {
  'use memo'

  const controllerRef = useRef<AbortController | null>(null)

  const createController = () => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    return controller
  }

  const abort = () => {
    controllerRef.current?.abort()
    controllerRef.current = null
  }

  const isActive = () => {
    return (
      controllerRef.current !== null && !controllerRef.current.signal.aborted
    )
  }

  return { createController, abort, isActive }
}
