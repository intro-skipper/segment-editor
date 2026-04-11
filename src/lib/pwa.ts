interface PwaUpdateCallbacks {
  onNeedRefresh: (applyUpdate: () => Promise<void>) => void
}

/**
 * Registers the Service Worker in standalone mode and exposes an update callback
 * when a new app version is waiting.
 *
 * Uses a dynamic import so the build succeeds even when vite-plugin-pwa is not
 * present (e.g. the Jellyfin plugin build).
 */
export async function registerPwaUpdates({
  onNeedRefresh,
}: PwaUpdateCallbacks): Promise<void> {
  if (typeof window === 'undefined') return
  if (import.meta.env.DEV) return
  if (!('serviceWorker' in navigator)) return

  try {
    const { registerSW } = await import('virtual:pwa-register')
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        onNeedRefresh(async () => {
          await updateSW(true)
        })
      },
    })
  } catch {
    // vite-plugin-pwa not available — skip SW registration
  }
}
