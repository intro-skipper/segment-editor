import { create } from 'zustand'
import type { MediaSegmentDto } from '@/types/jellyfin'

/**
 * Session state for transient UI state.
 * Not persisted to localStorage - resets on page refresh.
 */
export interface SessionState {
  /** Whether the settings dialog is open */
  settingsOpen: boolean
  /** Segment stored in clipboard for copy/paste operations */
  clipboardSegment: MediaSegmentDto | null
  /** Currently selected collection/library ID in FilterView */
  selectedCollectionId: string | null
}

export interface SessionActions {
  /** Toggle the settings dialog open/closed */
  toggleSettings: () => void
  /** Set the settings dialog open state */
  setSettingsOpen: (open: boolean) => void
  /** Save a segment to the clipboard */
  saveToClipboard: (segment: MediaSegmentDto) => void
  /** Get the segment from clipboard (returns null if empty) */
  getFromClipboard: () => MediaSegmentDto | null
  /** Clear the clipboard */
  clearClipboard: () => void
  /** Set the selected collection/library ID */
  setSelectedCollectionId: (id: string | null) => void
}

export type SessionStore = SessionState & SessionActions

const initialState: SessionState = {
  settingsOpen: false,
  clipboardSegment: null,
  selectedCollectionId: null,
}

/**
 * Zustand store for session state.
 * Manages transient UI state that doesn't need persistence.
 */
export const useSessionStore = create<SessionStore>()((set, get) => ({
  ...initialState,

  toggleSettings: () => {
    set((state) => ({ settingsOpen: !state.settingsOpen }))
  },

  setSettingsOpen: (open: boolean) => {
    set({ settingsOpen: open })
  },

  saveToClipboard: (segment: MediaSegmentDto) => {
    set({ clipboardSegment: segment })
  },

  getFromClipboard: () => {
    return get().clipboardSegment
  },

  clearClipboard: () => {
    set({ clipboardSegment: null })
  },

  setSelectedCollectionId: (id: string | null) => {
    set({ selectedCollectionId: id })
  },
}))
