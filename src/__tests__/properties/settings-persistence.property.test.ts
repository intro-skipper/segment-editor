/**
 * App store persistence: setters write to local storage immediately, and
 * rehydrating a persisted state from an older version migrates it to the
 * current shape.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/stores/app-store'

const APP_STORAGE_KEY = 'segment-editor-app'

type Theme = 'auto' | 'dark' | 'light'
type Locale = 'en-US' | 'de' | 'fr' | 'auto'

describe('Settings Persistence Round-Trip', () => {
  let originalAppStorage: string | null

  beforeEach(() => {
    originalAppStorage = localStorage.getItem(APP_STORAGE_KEY)
  })

  afterEach(() => {
    if (originalAppStorage !== null) {
      localStorage.setItem(APP_STORAGE_KEY, originalAppStorage)
    } else {
      localStorage.removeItem(APP_STORAGE_KEY)
    }
  })

  it('drops the removed EDL and chapter flags during migration', async () => {
    localStorage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify({
        state: { enableEdl: true, enableChapter: true },
        version: 3,
      }),
    )

    await useAppStore.persist.rehydrate()

    expect(useAppStore.getState()).not.toHaveProperty('enableEdl')
    expect(useAppStore.getState()).not.toHaveProperty('enableChapter')
  })

  it('defaults playback sync to disabled during app settings migration', async () => {
    const previousState = {
      theme: 'auto' satisfies Theme,
      locale: 'en-US' satisfies Locale,
      showVideoPlayer: true,
      enableEdl: false,
      enableChapter: false,
    }

    localStorage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify({ state: previousState, version: 1 }),
    )

    await useAppStore.persist.rehydrate()

    expect(useAppStore.getState().jellyfinPlaybackSyncEnabled).toBe(false)
  })

  it('defaults monochrome to disabled during app settings migration', async () => {
    const previousState = {
      theme: 'auto' satisfies Theme,
      locale: 'en-US' satisfies Locale,
      showVideoPlayer: true,
      enableEdl: false,
      enableChapter: false,
      jellyfinPlaybackSyncEnabled: false,
    }

    localStorage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify({ state: previousState, version: 2 }),
    )

    await useAppStore.persist.rehydrate()

    expect(useAppStore.getState().monochrome).toBe(false)
  })

  it('preserves enabled monochrome during app settings migration', async () => {
    const previousState = {
      theme: 'auto' satisfies Theme,
      monochrome: true,
      locale: 'en-US' satisfies Locale,
      showVideoPlayer: true,
      enableEdl: false,
      enableChapter: false,
      jellyfinPlaybackSyncEnabled: false,
    }

    localStorage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify({ state: previousState, version: 2 }),
    )

    await useAppStore.persist.rehydrate()

    expect(useAppStore.getState().monochrome).toBe(true)
  })

  it('preserves enabled playback sync during app settings migration', async () => {
    const previousState = {
      theme: 'auto' satisfies Theme,
      locale: 'en-US' satisfies Locale,
      showVideoPlayer: true,
      enableEdl: false,
      enableChapter: false,
      jellyfinPlaybackSyncEnabled: true,
    }

    localStorage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify({ state: previousState, version: 1 }),
    )

    await useAppStore.persist.rehydrate()

    expect(useAppStore.getState().jellyfinPlaybackSyncEnabled).toBe(true)
  })

  it('rewrites the legacy auto skip mode to skip during migration', async () => {
    // Rehydrate merges over live state, so start from the default the way a
    // fresh load would; otherwise a leftover value could pass for a migration.
    useAppStore.setState({ segmentSkipMode: 'button' })
    localStorage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify({ state: { segmentSkipMode: 'auto' }, version: 1 }),
    )

    await useAppStore.persist.rehydrate()

    expect(useAppStore.getState().segmentSkipMode).toBe('skip')
  })

  it('drops an off-union skip mode instead of storing it', async () => {
    useAppStore.setState({ segmentSkipMode: 'button' })
    localStorage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify({ state: { segmentSkipMode: 'nonsense' }, version: 1 }),
    )

    await useAppStore.persist.rehydrate()

    expect(useAppStore.getState().segmentSkipMode).toBe('button')
  })

  it('persists playback sync setter updates immediately', () => {
    localStorage.removeItem(APP_STORAGE_KEY)

    useAppStore.getState().setJellyfinPlaybackSyncEnabled(true)

    let stored = localStorage.getItem(APP_STORAGE_KEY)
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!).state.jellyfinPlaybackSyncEnabled).toBe(true)

    useAppStore.getState().setJellyfinPlaybackSyncEnabled(false)

    stored = localStorage.getItem(APP_STORAGE_KEY)
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!).state.jellyfinPlaybackSyncEnabled).toBe(false)
  })

  it('persists monochrome setter updates immediately', () => {
    localStorage.removeItem(APP_STORAGE_KEY)
    document.documentElement.classList.remove('monochrome')

    const { setMonochrome } = useAppStore.getState()

    setMonochrome(true)

    const storedAfterEnable = localStorage.getItem(APP_STORAGE_KEY)
    expect(storedAfterEnable).not.toBeNull()
    expect(JSON.parse(storedAfterEnable!).state.monochrome).toBe(true)
    expect(document.documentElement.classList.contains('monochrome')).toBe(true)

    setMonochrome(false)

    const storedAfterDisable = localStorage.getItem(APP_STORAGE_KEY)
    expect(storedAfterDisable).not.toBeNull()
    expect(JSON.parse(storedAfterDisable!).state.monochrome).toBe(false)
    expect(document.documentElement.classList.contains('monochrome')).toBe(
      false,
    )
  })
})
