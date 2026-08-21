import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { z } from 'zod'

export const PAGE_SIZE_OPTIONS = [12, 24, 48, 96, 120] as const
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
export const VIEW_MODE_OPTIONS = ['card', 'list'] as const
export type ViewMode = (typeof VIEW_MODE_OPTIONS)[number]

const DEFAULT_PAGE_SIZE: PageSize = 24
const DEFAULT_VIEW_MODE: ViewMode = 'card'

export const PageSizeSchema = z.literal(PAGE_SIZE_OPTIONS)
export const ViewModeSchema = z.enum(VIEW_MODE_OPTIONS)

interface SessionState {
  settingsOpen: boolean
  pageSize: PageSize
  viewMode: ViewMode
  playerVolume: number
  playerMuted: boolean
}

interface SessionActions {
  toggleSettings: () => void
  setSettingsOpen: (open: boolean) => void
  setPageSize: (size: PageSize) => void
  setViewMode: (mode: ViewMode) => void
  setPlayerVolume: (volume: number) => void
  setPlayerMuted: (muted: boolean) => void
}

type SessionStore = SessionState & SessionActions

const initialState: SessionState = {
  settingsOpen: false,
  pageSize: DEFAULT_PAGE_SIZE,
  viewMode: DEFAULT_VIEW_MODE,
  playerVolume: 1,
  playerMuted: false,
}

const clamp = (val: number, min: number, max: number) =>
  Math.max(min, Math.min(max, val))

/**
 * The persisted slice, decoded on rehydrate. Each field falls back to its
 * default so a payload written by an older build cannot corrupt the session.
 */
const PersistedSessionSchema = z.object({
  pageSize: PageSizeSchema.catch(DEFAULT_PAGE_SIZE),
  viewMode: ViewModeSchema.catch(DEFAULT_VIEW_MODE),
  playerVolume: z.number().min(0).max(1).catch(1),
  playerMuted: z.boolean().catch(false),
})

export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      ...initialState,
      toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setPageSize: (pageSize) => set({ pageSize }),
      setViewMode: (viewMode) => set({ viewMode }),
      setPlayerVolume: (playerVolume) =>
        set({ playerVolume: clamp(playerVolume, 0, 1) }),
      setPlayerMuted: (playerMuted) => set({ playerMuted }),
    }),
    {
      name: 'segment-editor-session',
      partialize: ({ pageSize, viewMode, playerVolume, playerMuted }) => ({
        pageSize,
        viewMode,
        playerVolume,
        playerMuted,
      }),
      merge: (persistedState, currentState) => {
        const persisted = PersistedSessionSchema.safeParse(persistedState)
        return persisted.success
          ? { ...currentState, ...persisted.data }
          : currentState
      },
    },
  ),
)
