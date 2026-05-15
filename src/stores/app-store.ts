import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'auto' | 'dark' | 'light'
export type Locale = 'en-US' | 'de' | 'fr' | 'auto'
export type SegmentSkipMode = 'button' | 'skip' | 'disabled'
type ResolvedLocale = Exclude<Locale, 'auto'>

/**
 * Track preferences for audio and subtitle selection.
 * These preferences are persisted and used to auto-select tracks
 * when loading new media items.
 */
interface TrackPreferences {
  /** Preferred audio track language (ISO 639-1 code, e.g., 'en', 'de') */
  preferredAudioLanguage: string | null
  /** Preferred subtitle track language (ISO 639-1 code, e.g., 'en', 'de') */
  preferredSubtitleLanguage: string | null
  /** Whether subtitles should be enabled by default */
  subtitlesEnabled: boolean
}

interface AppState {
  theme: Theme
  locale: Locale
  showVideoPlayer: boolean
  enableEdl: boolean
  enableChapter: boolean
  /** Track preferences for audio and subtitle auto-selection */
  trackPreferences: TrackPreferences
  /** How to handle segments during playback: show a button, auto-skip, or do nothing */
  segmentSkipMode: SegmentSkipMode
}

interface AppActions {
  setTheme: (theme: Theme) => void
  setLocale: (locale: Locale) => void
  setShowVideoPlayer: (show: boolean) => void
  setEnableEdl: (enable: boolean) => void
  setEnableChapter: (enable: boolean) => void
  /** Set preferred audio track language */
  setPreferredAudioLanguage: (language: string | null) => void
  /** Set preferred subtitle track language */
  setPreferredSubtitleLanguage: (language: string | null) => void
  /** Set whether subtitles should be enabled by default */
  setSubtitlesEnabled: (enabled: boolean) => void
  /** Set how segments are handled during playback */
  setSegmentSkipMode: (mode: SegmentSkipMode) => void
}

type AppStore = AppState & AppActions

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
  showVideoPlayer: true,
  enableEdl: false,
  enableChapter: false,
  trackPreferences: {
    preferredAudioLanguage: null,
    preferredSubtitleLanguage: null,
    subtitlesEnabled: false,
  },
  segmentSkipMode: 'button',
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
      setShowVideoPlayer: (showVideoPlayer) => set({ showVideoPlayer }),
      setEnableEdl: (enableEdl) => set({ enableEdl }),
      setEnableChapter: (enableChapter) => set({ enableChapter }),
      setPreferredAudioLanguage: (language) =>
        set((state) => ({
          trackPreferences: {
            ...state.trackPreferences,
            preferredAudioLanguage: language,
          },
        })),
      setPreferredSubtitleLanguage: (language) =>
        set((state) => ({
          trackPreferences: {
            ...state.trackPreferences,
            preferredSubtitleLanguage: language,
          },
        })),
      setSubtitlesEnabled: (enabled) =>
        set((state) => ({
          trackPreferences: {
            ...state.trackPreferences,
            subtitlesEnabled: enabled,
          },
        })),
      setSegmentSkipMode: (segmentSkipMode) => set({ segmentSkipMode }),
    }),
    {
      name: 'segment-editor-app',
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown>
        if (version < 1 && state.segmentSkipMode === 'auto') {
          state.segmentSkipMode = 'skip'
        }
        return state
      },
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme)
      },
    },
  ),
)

export const getEffectiveLocale = (locale: Locale): ResolvedLocale =>
  locale === 'auto' ? detectBrowserLocale() : locale

export const selectTheme = (state: AppStore): Theme => state.theme
