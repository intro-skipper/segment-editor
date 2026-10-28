import { useState } from 'react'

interface UseAbortControllerReturn {
  createController: () => AbortController
  abort: () => void
  isActive: () => boolean
}

/** One in-flight request at a time; the functions keep their identity across renders. */
export function useAbortController(): UseAbortControllerReturn {
  const [api] = useState(() => {
    let current: AbortController | null = null
    return {
      createController: () => {
        current?.abort()
        current = new AbortController()
        return current
      },
      abort: () => {
        current?.abort()
        current = null
      },
      isActive: () => current !== null && !current.signal.aborted,
    }
  })
  return api
}
