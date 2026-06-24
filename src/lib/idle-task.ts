interface IdleTaskOptions {
  /** Maximum time to wait for an idle period when the API is available. */
  timeout: number
  /** Delay used by browsers that do not implement requestIdleCallback. */
  fallbackDelay: number
}

/**
 * Schedules non-urgent work and returns an idempotent cancellation function.
 * Falls back to a timer when requestIdleCallback is unavailable.
 */
export function scheduleIdleTask(
  task: () => void,
  { timeout, fallbackDelay }: IdleTaskOptions,
): () => void {
  let idleCallbackId: number | null = null
  let timeoutId: number | null = null
  let cancelled = false

  const runTask = () => {
    idleCallbackId = null
    timeoutId = null

    if (!cancelled) {
      task()
    }
  }

  if (typeof window.requestIdleCallback === 'function') {
    idleCallbackId = window.requestIdleCallback(runTask, { timeout })
  } else {
    timeoutId = window.setTimeout(runTask, fallbackDelay)
  }

  return () => {
    cancelled = true

    if (
      idleCallbackId !== null &&
      typeof window.cancelIdleCallback === 'function'
    ) {
      window.cancelIdleCallback(idleCallbackId)
    }
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
    }

    idleCallbackId = null
    timeoutId = null
  }
}
