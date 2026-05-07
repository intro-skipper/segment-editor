import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const PAGE_SIZE_OPTIONS = [12, 24, 48, 96, 120] as const
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]
export const VIEW_MODE_OPTIONS = ['card', 'list'] as const
export type ViewMode = (typeof VIEW_MODE_OPTIONS)[number]

const DEFAULT_PAGE_SIZE: PageSize = 24
const DEFAULT_VIEW_MODE: ViewMode = 'card'

function normalizePageSize(value: unknown): PageSize {
  if (
    typeof value === 'number' &&
    PAGE_SIZE_OPTIONS.includes(value as PageSize)
  ) {
    return value as PageSize
  }
  return DEFAULT_PAGE_SIZE
}

function normalizeViewMode(value: unknown): ViewMode {
  if (
    typeof value === 'string' &&
    VIEW_MODE_OPTIONS.includes(value as ViewMode)
  ) {
    return value as ViewMode
  }
  return DEFAULT_VIEW_MODE
}

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

export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      ...initialState,
      toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setPageSize: (pageSize) => set({ pageSize: normalizePageSize(pageSize) }),
      setViewMode: (viewMode) => set({ viewMode: normalizeViewMode(viewMode) }),
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
        const persisted = persistedState as Partial<SessionState> | undefined
        return {
          ...currentState,
          ...persisted,
          pageSize: normalizePageSize(persisted?.pageSize),
          viewMode: normalizeViewMode(persisted?.viewMode),
        }
      },
    },
  ),
)
