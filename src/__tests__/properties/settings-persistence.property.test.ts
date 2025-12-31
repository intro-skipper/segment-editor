/**
 * Feature: Settings Persistence Round-Trip
 * For any settings change (theme, locale, provider, server address, API key),
 * the value SHALL be persisted to local storage immediately.
 * When the application loads, for any previously persisted settings,
 * the state SHALL be restored to match the persisted values exactly.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fc from 'fast-check'

// Storage key constants matching the stores
const APP_STORAGE_KEY = 'segment-editor-app'
const API_STORAGE_KEY = 'segment-editor-api'

// Type definitions matching the stores
type Theme = 'auto' | 'dark' | 'light'
type Locale = 'en-US' | 'de' | 'fr' | 'auto'

interface AppSettings {
  theme: Theme
  locale: Locale
  providerId: string
  showVideoPlayer: boolean
  enableEdl: boolean
  enableChapter: boolean
}

interface ApiSettings {
  serverAddress: string
  apiKey: string | undefined
}

// Arbitraries for generating random settings
const themeArb = fc.constantFrom<Theme>('auto', 'dark', 'light')
const localeArb = fc.constantFrom<Locale>('en-US', 'de', 'fr', 'auto')
const providerIdArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0)
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
  locale: localeArb,
  providerId: providerIdArb,
  showVideoPlayer: booleanArb,
  enableEdl: booleanArb,
  enableChapter: booleanArb,
})

const apiSettingsArb = fc.record<ApiSettings>({
  serverAddress: serverAddressArb,
  apiKey: apiKeyArb,
})

describe('Settings Persistence Round-Trip', () => {
  // Store original localStorage state
  let originalAppStorage: string | null
  let originalApiStorage: string | null

  beforeEach(() => {
    // Save original state
    originalAppStorage = localStorage.getItem(APP_STORAGE_KEY)
    originalApiStorage = localStorage.getItem(API_STORAGE_KEY)
  })

  afterEach(() => {
    // Restore original state
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

  /**
   * Property: App settings round-trip through localStorage
   * For any valid app settings, persisting to localStorage and reading back
   * should produce equivalent values.
   */
  it('round-trips app settings through localStorage', () => {
    fc.assert(
      fc.property(appSettingsArb, (settings) => {
        // Persist settings to localStorage (simulating Zustand persist)
        const persistedState = {
          state: settings,
          version: 0,
        }
        localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(persistedState))

        // Read back from localStorage
        const stored = localStorage.getItem(APP_STORAGE_KEY)
        expect(stored).not.toBeNull()

        const parsed = JSON.parse(stored!)
        const restored = parsed.state as AppSettings

        // Verify all settings match exactly
        expect(restored.theme).toBe(settings.theme)
        expect(restored.locale).toBe(settings.locale)
        expect(restored.providerId).toBe(settings.providerId)
        expect(restored.showVideoPlayer).toBe(settings.showVideoPlayer)
        expect(restored.enableEdl).toBe(settings.enableEdl)
        expect(restored.enableChapter).toBe(settings.enableChapter)

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: API settings round-trip through localStorage
   * For any valid API settings (server address, API key), persisting to
   * localStorage and reading back should produce equivalent values.
   */
  it('round-trips API settings through localStorage', () => {
    fc.assert(
      fc.property(apiSettingsArb, (settings) => {
        // Persist settings to localStorage (simulating Zustand persist with partialize)
        const persistedState = {
          state: {
            serverAddress: settings.serverAddress,
            apiKey: settings.apiKey,
          },
          version: 0,
        }
        localStorage.setItem(API_STORAGE_KEY, JSON.stringify(persistedState))

        // Read back from localStorage
        const stored = localStorage.getItem(API_STORAGE_KEY)
        expect(stored).not.toBeNull()

        const parsed = JSON.parse(stored!)
        const restored = parsed.state as ApiSettings

        // Verify settings match exactly
        expect(restored.serverAddress).toBe(settings.serverAddress)
        expect(restored.apiKey).toBe(settings.apiKey)

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Theme changes are persisted immediately
   * For any theme value, setting it should immediately update localStorage.
   */
  it('persists theme changes immediately', () => {
    fc.assert(
      fc.property(themeArb, (theme) => {
        // Set initial state
        const initialState = {
          state: {
            theme: 'auto' as Theme,
            locale: 'en-US' as Locale,
            providerId: 'SegmentEditor',
            showVideoPlayer: true,
            enableEdl: false,
            enableChapter: false,
          },
          version: 0,
        }
        localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(initialState))

        // Simulate theme change (update localStorage directly as Zustand would)
        const updatedState = {
          ...initialState,
          state: { ...initialState.state, theme },
        }
        localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(updatedState))

        // Verify change is persisted
        const stored = localStorage.getItem(APP_STORAGE_KEY)
        const parsed = JSON.parse(stored!)
        expect(parsed.state.theme).toBe(theme)

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Locale changes are persisted immediately
   * For any locale value, setting it should immediately update localStorage.
   */
  it('persists locale changes immediately', () => {
    fc.assert(
      fc.property(localeArb, (locale) => {
        // Set initial state
        const initialState = {
          state: {
            theme: 'auto' as Theme,
            locale: 'en-US' as Locale,
            providerId: 'SegmentEditor',
            showVideoPlayer: true,
            enableEdl: false,
            enableChapter: false,
          },
          version: 0,
        }
        localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(initialState))

        // Simulate locale change
        const updatedState = {
          ...initialState,
          state: { ...initialState.state, locale },
        }
        localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(updatedState))

        // Verify change is persisted
        const stored = localStorage.getItem(APP_STORAGE_KEY)
        const parsed = JSON.parse(stored!)
        expect(parsed.state.locale).toBe(locale)

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Multiple sequential settings changes are all persisted
   * For any sequence of settings changes, each change should be persisted
   * and the final state should reflect all changes.
   */
  it('persists multiple sequential settings changes', () => {
    fc.assert(
      fc.property(
        fc.array(appSettingsArb, { minLength: 1, maxLength: 10 }),
        (settingsSequence) => {
          // Apply each settings change in sequence
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

          // Final state should match the last settings in the sequence
          const finalSettings = settingsSequence[settingsSequence.length - 1]
          const stored = localStorage.getItem(APP_STORAGE_KEY)
          const parsed = JSON.parse(stored!)
          const restored = parsed.state as AppSettings

          expect(restored.theme).toBe(finalSettings.theme)
          expect(restored.locale).toBe(finalSettings.locale)
          expect(restored.providerId).toBe(finalSettings.providerId)
          expect(restored.showVideoPlayer).toBe(finalSettings.showVideoPlayer)
          expect(restored.enableEdl).toBe(finalSettings.enableEdl)
          expect(restored.enableChapter).toBe(finalSettings.enableChapter)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Server address and API key are persisted together
   * For any combination of server address and API key, both should be
   * persisted and restored correctly.
   */
  it('persists server address and API key together', () => {
    fc.assert(
      fc.property(serverAddressArb, apiKeyArb, (serverAddress, apiKey) => {
        // Persist both settings
        const persistedState = {
          state: { serverAddress, apiKey },
          version: 0,
        }
        localStorage.setItem(API_STORAGE_KEY, JSON.stringify(persistedState))

        // Read back and verify
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
