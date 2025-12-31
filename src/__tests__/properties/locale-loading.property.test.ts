/**
 * Feature: Locale Loading and Application
 * For any supported locale (en-US, de, fr), selecting that locale SHALL load
 * the corresponding translation file and all UI text SHALL update to use
 * translations from that locale.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import type { SupportedLocale } from '@/i18n/config'
import i18n, { changeLocale, supportedLocales } from '@/i18n/config'

// Import locale files directly for verification
import enUS from '@/i18n/locales/en-US.json'
import de from '@/i18n/locales/de.json'
import fr from '@/i18n/locales/fr.json'

// Map locales to their translation files
const localeTranslations: Record<SupportedLocale, Record<string, unknown>> = {
  'en-US': enUS,
  de: de,
  fr: fr,
}

// Sample translation keys to verify (covering different sections)
const sampleTranslationKeys = [
  'app.title',
  'app.theme.title',
  'app.locale.title',
  'login.test_conn',
  'segment.start',
  'segment.end',
  'yes',
  'no',
  'close',
  'back',
  'common.home',
  'player.volume',
  'editor.saveSegment',
] as const

// Arbitrary for generating supported locales
const supportedLocaleArb = fc.constantFrom<SupportedLocale>(...supportedLocales)

/**
 * Helper to get nested value from object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current, key) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key]
    }
    return undefined
  }, obj as unknown)
}

describe('Locale Loading and Application', () => {
  let originalLanguage: string

  beforeEach(() => {
    // Store original language
    originalLanguage = i18n.language
  })

  afterEach(() => {
    // Restore original language
    i18n.changeLanguage(originalLanguage)
  })

  /**
   * Property: Selecting a locale loads the correct translations
   * For any supported locale, after changing to that locale, i18n.t() should
   * return translations from the corresponding locale file.
   */
  it('loads correct translations for any supported locale', () => {
    fc.assert(
      fc.property(supportedLocaleArb, (locale) => {
        // Change to the selected locale
        changeLocale(locale)

        // Verify the language was changed
        expect(i18n.language).toBe(locale)

        // Verify sample translations match the locale file
        for (const key of sampleTranslationKeys) {
          const expectedValue = getNestedValue(localeTranslations[locale], key)
          const actualValue = i18n.t(key)

          // The translation should match the expected value from the locale file
          expect(actualValue).toBe(expectedValue)
        }

        return true
      }),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Locale changes are reflected immediately
   * For any sequence of locale changes, the current locale should always
   * reflect the most recent change.
   */
  it('reflects locale changes immediately', () => {
    fc.assert(
      fc.property(
        fc.array(supportedLocaleArb, { minLength: 1, maxLength: 10 }),
        (localeSequence) => {
          // Apply each locale change in sequence
          for (const locale of localeSequence) {
            changeLocale(locale)
            expect(i18n.language).toBe(locale)
          }

          // Final language should be the last in the sequence
          const finalLocale = localeSequence[localeSequence.length - 1]
          expect(i18n.language).toBe(finalLocale)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: All supported locales have consistent translation keys
   * For any translation key that exists in one locale, it should exist
   * in all supported locales.
   */
  it('has consistent translation keys across all locales', () => {
    fc.assert(
      fc.property(
        supportedLocaleArb,
        fc.constantFrom(...sampleTranslationKeys),
        (locale, key) => {
          // Change to the locale
          changeLocale(locale)

          // Get the translation
          const translation = i18n.t(key)

          // Translation should not be the key itself (which indicates missing translation)
          // and should be a non-empty string
          expect(translation).not.toBe(key)
          expect(typeof translation).toBe('string')
          expect(translation.length).toBeGreaterThan(0)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Locale-specific translations are different across locales
   * For any two different locales, at least some translations should differ
   * (proving that different locale files are actually loaded).
   */
  it('loads different translations for different locales', () => {
    fc.assert(
      fc.property(
        supportedLocaleArb,
        supportedLocaleArb,
        (locale1, locale2) => {
          // Skip if same locale
          if (locale1 === locale2) return true

          // Get translations for both locales
          changeLocale(locale1)
          const translations1 = sampleTranslationKeys.map((key) => i18n.t(key))

          changeLocale(locale2)
          const translations2 = sampleTranslationKeys.map((key) => i18n.t(key))

          // At least one translation should be different
          const hasDifference = translations1.some(
            (t, i) => t !== translations2[i],
          )
          expect(hasDifference).toBe(true)

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  /**
   * Property: Auto locale detection falls back correctly
   * When 'auto' is selected, the system should select a valid supported locale.
   */
  it('handles auto locale selection', () => {
    fc.assert(
      fc.property(fc.constant('auto' as const), () => {
        // Change to auto
        changeLocale('auto')

        // The resulting language should be one of the supported locales
        expect(supportedLocales).toContain(i18n.language as SupportedLocale)

        return true
      }),
      { numRuns: 100 },
    )
  })
})
