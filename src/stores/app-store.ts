import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Theme options for the application */
export type Theme = 'auto' | 'dark' | 'light'

/** Supported locales */
export type Locale = 'en-US' | 'de' | 'fr' | 'auto'

/** Resolved locale type (excludes 'auto') */
export type ResolvedLocale = 'en-US' | 'de' | 'fr'

/**
 * Application settings state.
 * Manages user preferences for theme, language, and features.
 */
export interface AppState {
  /** Current theme setting */
  theme: Theme
  /** Current locale/language setting */
  locale: Locale
  /** Selected segment provider ID */
  providerId: string
  /** Whether to show the video player */
  showVideoPlayer: boolean
  /** Whether EDL plugin integration is enabled */
  enableEdl: boolean
  /** Whether Chapter plugin integration is enabled */
  enableChapter: boolean
}

export interface AppActions {
  /** Set the theme and apply it to the document */
  setTheme: (theme: Theme) => void
  /** Set the locale */
  setLocale: (locale: Locale) => void
  /** Set the segment provider ID */
  setProviderId: (id: string) => void
  /** Toggle video player visibility */
  setShowVideoPlayer: (show: boolean) => void
  /** Toggle EDL plugin integration */
  setEnableEdl: (enable: boolean) => void
  /** Toggle Chapter plugin integration */
  setEnableChapter: (enable: boolean) => void
}

export type AppStore = AppState & AppActions

/**
 * Applies the theme to the document element.
 * Handles 'auto' by detecting system preference.
 */
function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return

  const root = document.documentElement

  // Remove existing theme classes
  root.classList.remove('light', 'dark')

  if (theme === 'auto') {
    // Use system preference
    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)',
    ).matches
    root.classList.add(prefersDark ? 'dark' : 'light')
  } else {
    root.classList.add(theme)
  }
}

/**
 * Detects the browser's preferred locale.
 */
function detectBrowserLocale(): ResolvedLocale {
  if (typeof navigator === 'undefined') return 'en-US'

  const browserLang = navigator.language

  if (browserLang.startsWith('de')) return 'de'
  if (browserLang.startsWith('fr')) return 'fr'
  return 'en-US'
}

const initialState: AppState = {
  theme: 'auto',
  locale: 'auto',
  providerId: 'SegmentEditor',
  showVideoPlayer: true,
  enableEdl: false,
  enableChapter: false,
}

/**
 * Zustand store for application settings.
 * Persists all settings to localStorage.
 */
export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      ...initialState,

      setTheme: (theme: Theme) => {
        applyTheme(theme)
        set({ theme })
      },

      setLocale: (locale: Locale) => {
        set({ locale })
      },

      setProviderId: (id: string) => {
        set({ providerId: id })
      },

      setShowVideoPlayer: (show: boolean) => {
        set({ showVideoPlayer: show })
      },

      setEnableEdl: (enable: boolean) => {
        set({ enableEdl: enable })
      },

      setEnableChapter: (enable: boolean) => {
        set({ enableChapter: enable })
      },
    }),
    {
      name: 'segment-editor-app',
      onRehydrateStorage: () => (state) => {
        // Apply theme on rehydration
        if (state) {
          applyTheme(state.theme)
        }
      },
    },
  ),
)

/**
 * Gets the effective locale, resolving 'auto' to the browser's preference.
 */
export function getEffectiveLocale(locale: Locale): ResolvedLocale {
  if (locale === 'auto') {
    return detectBrowserLocale()
  }
  return locale
}
