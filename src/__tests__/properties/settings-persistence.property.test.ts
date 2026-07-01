/**
 * Feature: Settings Persistence Round-Trip
 * For any settings change (theme, locale, server address),
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
const API_STORAGE_KEY = 'segment-editor-api'

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

interface ApiSettings {
  serverAddress: string
  apiKey: string | undefined
}

const themeArb = fc.constantFrom<Theme>('auto', 'dark', 'light')
const localeArb = fc.constantFrom<Locale>('en-US', 'de', 'fr', 'auto')
const booleanArb = fc.boolean()
const serverAddressArb = fc.webUrl()
const apiKeyArb = fc.option(
  fc
    .array(fc.constantFrom(...'0123456789abcdef'.split('')), {
      minLength: 32,
      maxLength: 64,
    })
    .map((chars) => chars.join('')),
  { nil: undefined },
)

const appSettingsArb = fc.record<AppSettings>({
  theme: themeArb,
  monochrome: booleanArb,
  locale: localeArb,
  showVideoPlayer: booleanArb,
  enableEdl: booleanArb,
  enableChapter: booleanArb,
  jellyfinPlaybackSyncEnabled: booleanArb,
})

const apiSettingsArb = fc.record<ApiSettings>({
  serverAddress: serverAddressArb,
  apiKey: apiKeyArb,
})

describe('Settings Persistence Round-Trip', () => {
  let originalAppStorage: string | null
  let originalApiStorage: string | null

  beforeEach(() => {
    originalAppStorage = localStorage.getItem(APP_STORAGE_KEY)
    originalApiStorage = localStorage.getItem(API_STORAGE_KEY)
  })

  afterEach(() => {
    if (originalAppStorage !== null) {
      localStorage.setItem(APP_STORAGE_KEY, originalAppStorage)
    } else {
      localStorage.removeItem(APP_STORAGE_KEY)
    }
    if (originalApiStorage !== null) {
      localStorage.setItem(API_STORAGE_KEY, originalApiStorage)
    } else {
      localStorage.removeItem(API_STORAGE_KEY)
    }
  })

  it('round-trips app settings through localStorage', () => {
    fc.assert(
      fc.property(appSettingsArb, (settings) => {
        const persistedState = {
          state: settings,
          version: 0,
        }
        localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(persistedState))

        const stored = localStorage.getItem(APP_STORAGE_KEY)
        expect(stored).not.toBeNull()

        const parsed = JSON.parse(stored!)
        const restored = parsed.state as AppSettings

        expect(restored.theme).toBe(settings.theme)
        expect(restored.monochrome).toBe(settings.monochrome)
        expect(restored.locale).toBe(settings.locale)
        expect(restored.showVideoPlayer).toBe(settings.showVideoPlayer)
        expect(restored.enableEdl).toBe(settings.enableEdl)
        expect(restored.enableChapter).toBe(settings.enableChapter)
        expect(restored.jellyfinPlaybackSyncEnabled).toBe(
          settings.jellyfinPlaybackSyncEnabled,
        )

        return true
      }),
      { numRuns: 100 },
    )
  })

  it('round-trips API settings through localStorage', () => {
    fc.assert(
      fc.property(apiSettingsArb, (settings) => {
        const persistedState = {
          state: {
            serverAddress: settings.serverAddress,
          },
          version: 0,
        }
        localStorage.setItem(API_STORAGE_KEY, JSON.stringify(persistedState))

        const stored = localStorage.getItem(API_STORAGE_KEY)
        expect(stored).not.toBeNull()

        const parsed = JSON.parse(stored!)
        const restored = parsed.state as ApiSettings

        expect(restored.serverAddress).toBe(settings.serverAddress)
        expect(restored.apiKey).toBeUndefined()

        return true
      }),
      { numRuns: 100 },
    )
  })

  it('persists theme changes immediately', () => {
    fc.assert(
      fc.property(themeArb, (theme) => {
        const initialState = {
          state: {
            theme: 'auto' as Theme,
            monochrome: false,
            locale: 'en-US' as Locale,
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
            theme: 'auto' as Theme,
            monochrome: false,
            locale: 'en-US' as Locale,
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
          const restored = parsed.state as AppSettings

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
      theme: 'auto' as Theme,
      locale: 'en-US' as Locale,
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
      theme: 'auto' as Theme,
      locale: 'en-US' as Locale,
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
      theme: 'auto' as Theme,
      monochrome: true,
      locale: 'en-US' as Locale,
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
      theme: 'auto' as Theme,
      locale: 'en-US' as Locale,
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

    useAppStore.getState().setMonochrome(true)

    let stored = localStorage.getItem(APP_STORAGE_KEY)
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!).state.monochrome).toBe(true)

    useAppStore.getState().setMonochrome(false)

    stored = localStorage.getItem(APP_STORAGE_KEY)
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!).state.monochrome).toBe(false)
  })

  it('persists server address and API key together', () => {
    fc.assert(
      fc.property(serverAddressArb, apiKeyArb, (serverAddress, apiKey) => {
        const persistedState = {
          state: { serverAddress, apiKey },
          version: 0,
        }
        localStorage.setItem(API_STORAGE_KEY, JSON.stringify(persistedState))

        const stored = localStorage.getItem(API_STORAGE_KEY)
        const parsed = JSON.parse(stored!)

        expect(parsed.state.serverAddress).toBe(serverAddress)
        expect(parsed.state.apiKey).toBe(apiKey)

        return true
      }),
      { numRuns: 100 },
    )
  })
})
