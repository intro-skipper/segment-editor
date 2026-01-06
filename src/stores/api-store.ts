import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ApiState {
  serverAddress: string
  apiKey: string | undefined
  serverVersion: string
  validConnection: boolean
  validAuth: boolean
}

export interface ApiActions {
  setServerAddress: (address: string) => void
  setApiKey: (key: string | undefined) => void
  setServerVersion: (version: string) => void
  setConnectionStatus: (valid: boolean, auth: boolean) => void
  resetConnection: () => void
}

export type ApiStore = ApiState & ApiActions

const initialState: ApiState = {
  serverAddress: '',
  apiKey: undefined,
  serverVersion: '',
  validConnection: false,
  validAuth: false,
}

/** Sanitizes URL by trimming whitespace and removing trailing slashes */
export const sanitizeUrl = (val: string | undefined): string | undefined =>
  val?.trim().replace(/\/+$/, '') || undefined

/** Sanitizes API key by trimming whitespace */
const sanitizeKey = (val: string | undefined): string | undefined =>
  val?.trim() || undefined

/** Clears SDK API cache when credentials change */
const clearApiCache = () => {
  // Dynamic import to avoid circular dependency
  import('@/services/jellyfin/sdk').then((sdk) => sdk.clearApiCache())
}

export const useApiStore = create<ApiStore>()(
  persist(
    (set) => ({
      ...initialState,
      setServerAddress: (serverAddress) => {
        clearApiCache()
        // Store raw value - sanitization happens when URL is used
        set({ serverAddress: serverAddress.trim() })
      },
      setApiKey: (apiKey) => {
        clearApiCache()
        set({ apiKey: sanitizeKey(apiKey) })
      },
      setServerVersion: (serverVersion) => set({ serverVersion }),
      setConnectionStatus: (validConnection, validAuth) =>
        set({ validConnection, validAuth }),
      resetConnection: () => {
        clearApiCache()
        set({ validConnection: false, validAuth: false, serverVersion: '' })
      },
    }),
    {
      name: 'segment-editor-api',
      partialize: ({ serverAddress, apiKey }) => ({ serverAddress, apiKey }),
      merge: (persisted, current) => {
        const p = persisted as Partial<ApiState> | null
        return {
          ...current,
          serverAddress: p?.serverAddress?.trim() ?? '',
          apiKey: sanitizeKey(p?.apiKey),
        }
      },
    },
  ),
)
