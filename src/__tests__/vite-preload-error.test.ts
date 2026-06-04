import { describe, expect, it, vi } from 'vitest'

import {
  createVitePreloadErrorHandler,
  installVitePreloadErrorHandler,
} from '@/lib/vite-preload-error'

function createStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const values: Record<string, string> = {}

  return {
    getItem: vi.fn((key: string) => values[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete values[key]
    }),
  }
}

function createPreloadEvent(): VitePreloadErrorEvent {
  return {
    payload: new Error('Failed to fetch dynamically imported module'),
    preventDefault: vi.fn(),
  } as unknown as VitePreloadErrorEvent
}

describe('vite preload error handling', () => {
  it('reloads the current page once for the first preload error', () => {
    const href =
      'https://segment-editor.test/player/00000000-0000-0000-0000-000000000001'
    const reload = vi.fn()
    const storage = createStorage()
    const handler = createVitePreloadErrorHandler({
      location: { href, reload },
      storage,
    })
    const event = createPreloadEvent()

    handler(event)

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(storage.setItem).toHaveBeenCalledWith(expect.any(String), href)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('suppresses duplicate preload errors while a reload is pending', () => {
    const href = 'https://segment-editor.test/'
    const reload = vi.fn()
    const storage = createStorage()
    const handler = createVitePreloadErrorHandler({
      location: { href, reload },
      storage,
    })

    handler(createPreloadEvent())
    reload.mockClear()

    const duplicateEvent = createPreloadEvent()
    handler(duplicateEvent)

    expect(duplicateEvent.preventDefault).toHaveBeenCalledTimes(1)
    expect(reload).not.toHaveBeenCalled()
  })

  it('lets the import error propagate after a reload already failed for this URL', () => {
    const href =
      'https://segment-editor.test/album/00000000-0000-0000-0000-000000000001'
    const reload = vi.fn()
    const storage = createStorage()

    createVitePreloadErrorHandler({
      location: { href, reload },
      storage,
    })(createPreloadEvent())

    const eventAfterReload = createPreloadEvent()
    createVitePreloadErrorHandler({
      location: { href, reload },
      storage,
    })(eventAfterReload)

    expect(eventAfterReload.preventDefault).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('lets the import error propagate when session storage is unavailable', () => {
    const href = 'https://segment-editor.test/'
    const reload = vi.fn()
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: Object.defineProperty({}, 'sessionStorage', {
        configurable: true,
        get: () => {
          throw new Error('Storage access denied')
        },
      }),
    })

    try {
      const handler = createVitePreloadErrorHandler({
        location: { href, reload },
      })
      const event = createPreloadEvent()

      handler(event)

      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(reload).not.toHaveBeenCalled()
    } finally {
      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow)
      } else {
        delete (globalThis as { window?: unknown }).window
      }
    }
  })

  it('lets the import error propagate when the reload marker cannot persist', () => {
    const href = 'https://segment-editor.test/'
    const reload = vi.fn()
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('Storage write denied')
      }),
      removeItem: vi.fn(),
    }
    const handler = createVitePreloadErrorHandler({
      location: { href, reload },
      storage,
    })
    const event = createPreloadEvent()

    handler(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('clears the reload marker after startup remains stable', () => {
    vi.useFakeTimers()

    const href = 'https://segment-editor.test/'
    const reload = vi.fn()
    const storage = createStorage()

    createVitePreloadErrorHandler({
      location: { href, reload },
      storage,
    })(createPreloadEvent())
    reload.mockClear()

    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: { href, reload },
        sessionStorage: storage,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        setTimeout: globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout,
      },
    })

    try {
      const uninstall = installVitePreloadErrorHandler()

      vi.advanceTimersByTime(5_000)

      const eventAfterStableStartup = createPreloadEvent()
      createVitePreloadErrorHandler({
        location: { href, reload },
        storage,
      })(eventAfterStableStartup)

      expect(storage.removeItem).toHaveBeenCalledWith(expect.any(String))
      expect(eventAfterStableStartup.preventDefault).toHaveBeenCalledTimes(1)
      expect(reload).toHaveBeenCalledTimes(1)

      uninstall()
    } finally {
      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow)
      } else {
        delete (globalThis as { window?: unknown }).window
      }
      vi.useRealTimers()
    }
  })

  it('clears the reload marker for the recovered URL after client-side navigation', () => {
    vi.useFakeTimers()

    const recoveredHref =
      'https://segment-editor.test/player/00000000-0000-0000-0000-000000000001'
    const navigatedHref = 'https://segment-editor.test/'
    const reload = vi.fn()
    const storage = createStorage()

    createVitePreloadErrorHandler({
      location: { href: recoveredHref, reload },
      storage,
    })(createPreloadEvent())
    reload.mockClear()

    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
    const location = { href: recoveredHref, reload }
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location,
        sessionStorage: storage,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        setTimeout: globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout,
      },
    })

    try {
      const uninstall = installVitePreloadErrorHandler()
      location.href = navigatedHref

      vi.advanceTimersByTime(5_000)

      const eventAfterStableStartup = createPreloadEvent()
      createVitePreloadErrorHandler({
        location: { href: recoveredHref, reload },
        storage,
      })(eventAfterStableStartup)

      expect(storage.removeItem).toHaveBeenCalledWith(expect.any(String))
      expect(eventAfterStableStartup.preventDefault).toHaveBeenCalledTimes(1)
      expect(reload).toHaveBeenCalledTimes(1)

      uninstall()
    } finally {
      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow)
      } else {
        delete (globalThis as { window?: unknown }).window
      }
      vi.useRealTimers()
    }
  })
})
