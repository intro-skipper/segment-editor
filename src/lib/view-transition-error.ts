/**
 * Suppresses unhandled promise rejections caused by superseded View
 * Transitions.
 *
 * TanStack Router starts a view transition for every path-changing
 * navigation. When a second navigation begins before the previous transition
 * finished, the browser aborts the old transition and rejects its pending
 * promises. Nothing awaits those promises, so the rejection surfaces as an
 * unhandled error:
 * - WebKit: "AbortError: Old view transition aborted by new view transition."
 * - Chromium: "AbortError: Transition was skipped"
 * These rejections are an expected part of the View Transition lifecycle and
 * must not reach global error reporting (e.g. the Jellyfin Web host page).
 *
 * Deliberately narrow: only `AbortError` supersession/skip messages are
 * suppressed. Chromium reports genuine authoring defects (such as duplicate
 * `view-transition-name` values) as `InvalidStateError: Transition was
 * aborted because of invalid state`, which must stay visible to error
 * reporting.
 */

const VIEW_TRANSITION_ABORT_PATTERNS = [
  /view transition/i,
  /transition was skipped/i,
]

export function isViewTransitionAbortError(reason: unknown): boolean {
  if (!(reason instanceof DOMException)) return false
  if (reason.name !== 'AbortError') return false
  return VIEW_TRANSITION_ABORT_PATTERNS.some((pattern) =>
    pattern.test(reason.message),
  )
}

export function createViewTransitionAbortHandler(): (
  event: PromiseRejectionEvent,
) => void {
  return (event) => {
    if (isViewTransitionAbortError(event.reason)) {
      event.preventDefault()
    }
  }
}

export function installViewTransitionAbortHandler(): () => void {
  const handler = createViewTransitionAbortHandler()
  window.addEventListener('unhandledrejection', handler)

  return () => {
    window.removeEventListener('unhandledrejection', handler)
  }
}
