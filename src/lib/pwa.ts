import { registerSW } from 'virtual:pwa-register'

interface PwaUpdateCallbacks {
  onNeedRefresh: (applyUpdate: () => Promise<void>) => void
}

/**
 * Registers the Service Worker in standalone mode and exposes an update callback
 * when a new app version is waiting.
 */
export function registerPwaUpdates({
  onNeedRefresh,
}: PwaUpdateCallbacks): void {
  if (typeof window === 'undefined') return
  if (import.meta.env.DEV) return
  if (!('serviceWorker' in navigator)) return

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      onNeedRefresh(async () => {
        await updateSW(true)
      })
    },
  })
}
