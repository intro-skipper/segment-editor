import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isValidProviderId } from '@/lib/schemas'

export type Theme = 'auto' | 'dark' | 'light'
export type Locale = 'en-US' | 'de' | 'fr' | 'auto'
export type ResolvedLocale = Exclude<Locale, 'auto'>

export interface AppState {
  theme: Theme
  locale: Locale
  providerId: string
  showVideoPlayer: boolean
  enableEdl: boolean
  enableChapter: boolean
}

export interface AppActions {
  setTheme: (theme: Theme) => void
  setLocale: (locale: Locale) => void
  setProviderId: (id: string) => void
  setShowVideoPlayer: (show: boolean) => void
  setEnableEdl: (enable: boolean) => void
  setEnableChapter: (enable: boolean) => void
}

export type AppStore = AppState & AppActions

const applyTheme = (theme: Theme): void => {
  if (typeof document === 'undefined') return
  try {
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)',
    ).matches
    const resolved = theme === 'auto' ? (prefersDark ? 'dark' : 'light') : theme
    root.classList.add(resolved)
  } catch {
    /* ignore in test/SSR */
  }
}

const detectBrowserLocale = (): ResolvedLocale => {
  if (typeof navigator === 'undefined') return 'en-US'
  const lang = navigator.language
  if (lang.startsWith('de')) return 'de'
  if (lang.startsWith('fr')) return 'fr'
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

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      ...initialState,
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
      setLocale: (locale) => set({ locale }),
      setProviderId: (providerId) => {
        if (isValidProviderId(providerId)) set({ providerId })
      },
      setShowVideoPlayer: (showVideoPlayer) => set({ showVideoPlayer }),
      setEnableEdl: (enableEdl) => set({ enableEdl }),
      setEnableChapter: (enableChapter) => set({ enableChapter }),
    }),
    {
      name: 'segment-editor-app',
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme)
      },
    },
  ),
)

export const getEffectiveLocale = (locale: Locale): ResolvedLocale =>
  locale === 'auto' ? detectBrowserLocale() : locale

export const selectTheme = (state: AppStore): Theme => state.theme
