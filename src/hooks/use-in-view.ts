/**
 * Latching viewport-visibility hook.
 * Reports when an element first enters (or nears, via rootMargin) the
 * viewport, then stays true and stops observing. Used to defer per-item
 * network requests in long lists until rows approach the viewport.
 *
 * Falls back to immediately visible when IntersectionObserver is
 * unavailable (older browsers, non-DOM test environments).
 */

import * as React from 'react'

interface UseInViewOptions {
  /** Margin around the viewport used for early triggering (e.g. '600px 0px') */
  rootMargin?: string
}

interface UseInViewReturn<T extends Element> {
  ref: React.RefObject<T | null>
  inView: boolean
}

export function useInView<T extends Element>(
  options?: UseInViewOptions,
): UseInViewReturn<T> {
  const ref = React.useRef<T | null>(null)
  // Fall back to immediately visible when IntersectionObserver is missing
  const [inView, setInView] = React.useState(
    () => typeof IntersectionObserver === 'undefined',
  )
  const rootMargin = options?.rootMargin ?? '0px'

  React.useEffect(() => {
    if (inView) return

    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin },
    )
    observer.observe(element)

    return () => observer.disconnect()
  }, [inView, rootMargin])

  return { ref, inView }
}
