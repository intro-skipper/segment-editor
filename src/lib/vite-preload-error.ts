const PRELOAD_RELOAD_URL_KEY = 'segment-editor:vite-preload-error-url'
const RELOAD_MARKER_CLEAR_DELAY_MS = 5_000

type VitePreloadErrorStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>

function getSessionStorage(): VitePreloadErrorStorage | undefined {
  try {
    return window.sessionStorage
  } catch {
    return undefined
  }
}

export interface VitePreloadErrorHandlerOptions {
  location?: Pick<Location, 'href' | 'reload'>
  storage?: VitePreloadErrorStorage
}

export function createVitePreloadErrorHandler(
  options: VitePreloadErrorHandlerOptions = {},
): (event: VitePreloadErrorEvent) => void {
  const location = options.location ?? window.location
  const storage = options.storage ?? getSessionStorage()
  let reloadPending = false

  return (event: VitePreloadErrorEvent) => {
    if (reloadPending) {
      event.preventDefault()
      return
    }

    if (storage === undefined) return

    try {
      if (storage.getItem(PRELOAD_RELOAD_URL_KEY) === location.href) return
      storage.setItem(PRELOAD_RELOAD_URL_KEY, location.href)
    } catch {
      return
    }

    reloadPending = true
    event.preventDefault()
    location.reload()
  }
}

function clearPreloadReloadMarker(
  href: string,
  storage: VitePreloadErrorStorage,
) {
  try {
    if (storage.getItem(PRELOAD_RELOAD_URL_KEY) === href) {
      storage.removeItem(PRELOAD_RELOAD_URL_KEY)
    }
  } catch {}
}

export function installVitePreloadErrorHandler(): () => void {
  const location = window.location
  const startupHref = location.href
  const storage = getSessionStorage()
  const handler = createVitePreloadErrorHandler({ location, storage })
  const markerClearTimer =
    storage === undefined
      ? undefined
      : window.setTimeout(() => {
          clearPreloadReloadMarker(startupHref, storage)
        }, RELOAD_MARKER_CLEAR_DELAY_MS)

  window.addEventListener('vite:preloadError', handler)

  return () => {
    window.removeEventListener('vite:preloadError', handler)
    if (markerClearTimer !== undefined) {
      window.clearTimeout(markerClearTimer)
    }
  }
}
