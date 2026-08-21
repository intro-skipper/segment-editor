import { create } from 'zustand'
import { z } from 'zod'
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
  monochrome: boolean
  locale: Locale
  showVideoPlayer: boolean
  enableEdl: boolean
  enableChapter: boolean
  /** Track preferences for audio and subtitle auto-selection */
  trackPreferences: TrackPreferences
  /** How to handle segments during playback: show a button, auto-skip, or do nothing */
  segmentSkipMode: SegmentSkipMode
  segmentSkipModeRevision: number
  jellyfinPlaybackSyncEnabled: boolean
}

interface AppActions {
  setTheme: (theme: Theme) => void
  setMonochrome: (monochrome: boolean) => void
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
  setJellyfinPlaybackSyncEnabled: (enabled: boolean) => void
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
    root.style.colorScheme = resolved
  } catch {
    /* ignore in test/SSR */
  }
}

const applyMonochrome = (monochrome: boolean): void => {
  if (typeof document === 'undefined') return
  try {
    document.documentElement.classList.toggle('monochrome', monochrome)
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

/**
 * Persisted app state as older builds wrote it. Only the fields migrations
 * touch are decoded; every other key is preserved untouched.
 *
 * `segmentSkipMode` decodes `'auto'` alongside the current modes because that
 * is the legacy spelling the migration below rewrites. Narrowing it to the
 * three live modes would catch `'auto'` to a default and lose the rewrite.
 */
const LegacyPersistedAppSchema = z.looseObject({
  segmentSkipMode: z
    .enum(['button', 'skip', 'disabled', 'auto'])
    .optional()
    .catch(undefined),
  jellyfinPlaybackSyncEnabled: z.boolean().optional().catch(undefined),
  monochrome: z.boolean().optional().catch(undefined),
})

const initialState: AppState = {
  theme: 'auto',
  monochrome: false,
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
  segmentSkipModeRevision: 0,
  jellyfinPlaybackSyncEnabled: false,
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      ...initialState,
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
      setMonochrome: (monochrome) => {
        applyMonochrome(monochrome)
        set({ monochrome })
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
      setSegmentSkipMode: (segmentSkipMode) =>
        set((state) =>
          state.segmentSkipMode === segmentSkipMode
            ? state
            : {
                segmentSkipMode,
                segmentSkipModeRevision: state.segmentSkipModeRevision + 1,
              },
        ),
      setJellyfinPlaybackSyncEnabled: (jellyfinPlaybackSyncEnabled) =>
        set({ jellyfinPlaybackSyncEnabled }),
    }),
    {
      name: 'segment-editor-app',
      version: 3,
      migrate: (persistedState, version) => {
        const decoded = LegacyPersistedAppSchema.safeParse(persistedState)
        if (!decoded.success) return persistedState

        // Decoding re-adds a declared key as `undefined` when the stored value
        // was absent or off-type. Those keys have to go: the merge that follows
        // would otherwise overwrite a good default with `undefined`.
        const state: Record<string, unknown> = Object.fromEntries(
          Object.entries(decoded.data).filter(
            ([, value]) => value !== undefined,
          ),
        )

        if (state.segmentSkipMode === 'auto') {
          state.segmentSkipMode = 'skip'
        }
        if (version < 2 && state.jellyfinPlaybackSyncEnabled === undefined) {
          state.jellyfinPlaybackSyncEnabled = false
        }
        if (version < 3 && state.monochrome === undefined) {
          state.monochrome = false
        }
        return state
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme)
          applyMonochrome(state.monochrome)
        }
      },
    },
  ),
)

export const getEffectiveLocale = (locale: Locale): ResolvedLocale =>
  locale === 'auto' ? detectBrowserLocale() : locale

export const selectTheme = (state: AppStore): Theme => state.theme
export const selectMonochrome = (state: AppStore): boolean => state.monochrome
