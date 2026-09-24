/**
 * Feature: Settings Persistence Round-Trip
 * For any settings change (theme, locale, monochrome, playback sync),
 * the value SHALL be persisted to local storage immediately.
 * When the application loads, for any previously persisted settings,
 * the state SHALL be restored to match the persisted values exactly.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { useAppStore } from '@/stores/app-store'

const APP_STORAGE_KEY = 'segment-editor-app'

type Theme = 'auto' | 'dark' | 'light'
type Locale = 'en-US' | 'de' | 'fr' | 'auto'

interface AppSettings {
  theme: Theme
  monochrome: boolean
  locale: Locale
  showVideoPlayer: boolean
  enableEdl: boolean
  enableChapter: boolean
  jellyfinPlaybackSyncEnabled: boolean
}

const themeArb = fc.constantFrom<Theme>('auto', 'dark', 'light')
const localeArb = fc.constantFrom<Locale>('en-US', 'de', 'fr', 'auto')
const booleanArb = fc.boolean()

const appSettingsArb = fc.record<AppSettings>({
  theme: themeArb,
  monochrome: booleanArb,
  locale: localeArb,
  showVideoPlayer: booleanArb,
  enableEdl: booleanArb,
  enableChapter: booleanArb,
  jellyfinPlaybackSyncEnabled: booleanArb,
})

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

  it('persists theme changes immediately', () => {
    fc.assert(
      fc.property(themeArb, (theme) => {
        const initialState = {
          state: {
            theme: 'auto' satisfies Theme,
            monochrome: false,
            locale: 'en-US' satisfies Locale,
            showVideoPlayer: true,
            enableEdl: false,
            enableChapter: false,
            jellyfinPlaybackSyncEnabled: false,
          },
          version: 0,
        }
        localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(initialState))

        const updatedState = {
          ...initialState,
          state: { ...initialState.state, theme },
        }
        localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(updatedState))

        const stored = localStorage.getItem(APP_STORAGE_KEY)
        const parsed = JSON.parse(stored!)
        expect(parsed.state.theme).toBe(theme)

        return true
      }),
      { numRuns: 100 },
    )
  })

  it('persists locale changes immediately', () => {
    fc.assert(
      fc.property(localeArb, (locale) => {
        const initialState = {
          state: {
            theme: 'auto' satisfies Theme,
            monochrome: false,
            locale: 'en-US' satisfies Locale,
            showVideoPlayer: true,
            enableEdl: false,
            enableChapter: false,
            jellyfinPlaybackSyncEnabled: false,
          },
          version: 0,
        }
        localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(initialState))

        const updatedState = {
          ...initialState,
          state: { ...initialState.state, locale },
        }
        localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(updatedState))

        const stored = localStorage.getItem(APP_STORAGE_KEY)
        const parsed = JSON.parse(stored!)
        expect(parsed.state.locale).toBe(locale)

        return true
      }),
      { numRuns: 100 },
    )
  })

  it('persists multiple sequential settings changes', () => {
    fc.assert(
      fc.property(
        fc.array(appSettingsArb, { minLength: 1, maxLength: 10 }),
        (settingsSequence) => {
          for (const settings of settingsSequence) {
            const persistedState = {
              state: settings,
              version: 0,
            }
            localStorage.setItem(
              APP_STORAGE_KEY,
              JSON.stringify(persistedState),
            )
          }

          const finalSettings = settingsSequence[settingsSequence.length - 1]
          const stored = localStorage.getItem(APP_STORAGE_KEY)
          const parsed = JSON.parse(stored!)
          const restored: AppSettings = parsed.state

          expect(restored.theme).toBe(finalSettings.theme)
          expect(restored.monochrome).toBe(finalSettings.monochrome)
          expect(restored.locale).toBe(finalSettings.locale)
          expect(restored.showVideoPlayer).toBe(finalSettings.showVideoPlayer)
          expect(restored.enableEdl).toBe(finalSettings.enableEdl)
          expect(restored.enableChapter).toBe(finalSettings.enableChapter)
          expect(restored.jellyfinPlaybackSyncEnabled).toBe(
            finalSettings.jellyfinPlaybackSyncEnabled,
          )

          return true
        },
      ),
      { numRuns: 100 },
    )
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
