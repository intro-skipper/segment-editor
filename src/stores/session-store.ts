import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { VibrantColors } from '@/hooks/use-vibrant-color'

export const PAGE_SIZE_OPTIONS = [12, 24, 48, 96] as const
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]

export interface SessionState {
  settingsOpen: boolean
  selectedCollectionId: string | null
  pageSize: PageSize
  searchExpanded: boolean
  searchFilter: string
  vibrantColors: VibrantColors | null
  playerVolume: number
  playerMuted: boolean
}

export interface SessionActions {
  toggleSettings: () => void
  setSettingsOpen: (open: boolean) => void
  setSelectedCollectionId: (id: string | null) => void
  setPageSize: (size: PageSize) => void
  toggleSearch: () => void
  setSearchExpanded: (expanded: boolean) => void
  setSearchFilter: (filter: string) => void
  setVibrantColors: (colors: VibrantColors | null) => void
  setPlayerVolume: (volume: number) => void
  setPlayerMuted: (muted: boolean) => void
}

export type SessionStore = SessionState & SessionActions

const initialState: SessionState = {
  settingsOpen: false,
  selectedCollectionId: null,
  pageSize: 24,
  searchExpanded: false,
  searchFilter: '',
  vibrantColors: null,
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
      setSelectedCollectionId: (selectedCollectionId) =>
        set({ selectedCollectionId }),
      setPageSize: (pageSize) => set({ pageSize }),
      toggleSearch: () => set((s) => ({ searchExpanded: !s.searchExpanded })),
      setSearchExpanded: (searchExpanded) => set({ searchExpanded }),
      setSearchFilter: (searchFilter) => set({ searchFilter }),
      setVibrantColors: (vibrantColors) => set({ vibrantColors }),
      setPlayerVolume: (playerVolume) =>
        set({ playerVolume: clamp(playerVolume, 0, 1) }),
      setPlayerMuted: (playerMuted) => set({ playerMuted }),
    }),
    {
      name: 'segment-editor-session',
      partialize: ({ pageSize, playerVolume, playerMuted }) => ({
        pageSize,
        playerVolume,
        playerMuted,
      }),
    },
  ),
)
