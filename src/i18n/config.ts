import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import enUS from './locales/en-US.json'
import de from './locales/de.json'
import fr from './locales/fr.json'

export const supportedLocales = ['en-US', 'de', 'fr'] as const
export type SupportedLocale = (typeof supportedLocales)[number]

export const localeNames: Record<SupportedLocale, string> = {
  'en-US': 'English',
  de: 'Deutsch',
  fr: 'Français',
}

const resources = {
  'en-US': { translation: enUS },
  de: { translation: de },
  fr: { translation: fr },
}

/**
 * Detects the user's preferred locale from browser settings
 * Falls back to 'en-US' if no supported locale is found
 */
function detectBrowserLocale(): SupportedLocale {
  const browserLang = navigator.language || navigator.languages[0]

  if (!browserLang) return 'en-US'

  // Check for exact match first
  if (supportedLocales.includes(browserLang as SupportedLocale)) {
    return browserLang as SupportedLocale
  }

  // Check for language code match (e.g., 'de-DE' -> 'de')
  const langCode = browserLang.split('-')[0]
  const match = supportedLocales.find(
    (locale) => locale === langCode || locale.startsWith(`${langCode}-`),
  )

  return match || 'en-US'
}

/**
 * Gets the initial locale based on stored preference or browser detection
 */
export function getInitialLocale(): SupportedLocale {
  const stored = localStorage.getItem('app-locale')

  if (stored === 'auto' || !stored) {
    return detectBrowserLocale()
  }

  if (supportedLocales.includes(stored as SupportedLocale)) {
    return stored as SupportedLocale
  }

  return 'en-US'
}

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLocale(),
  fallbackLng: 'en-US',
  interpolation: {
    escapeValue: false, // React already escapes values
  },
  react: {
    useSuspense: false, // Disable suspense for simpler error handling
  },
})

/**
 * Changes the current locale and optionally persists the preference
 */
export function changeLocale(locale: SupportedLocale | 'auto'): void {
  if (locale === 'auto') {
    const detected = detectBrowserLocale()
    i18n.changeLanguage(detected)
  } else {
    i18n.changeLanguage(locale)
  }
}

export default i18n
