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

const sanitize = (val: string | undefined): string | undefined =>
  val?.trim().replace(/\/+$/, '') || undefined

export const useApiStore = create<ApiStore>()(
  persist(
    (set) => ({
      ...initialState,
      setServerAddress: (serverAddress) =>
        set({ serverAddress: sanitize(serverAddress) ?? '' }),
      setApiKey: (apiKey) => set({ apiKey: sanitize(apiKey) }),
      setServerVersion: (serverVersion) => set({ serverVersion }),
      setConnectionStatus: (validConnection, validAuth) =>
        set({ validConnection, validAuth }),
      resetConnection: () =>
        set({ validConnection: false, validAuth: false, serverVersion: '' }),
    }),
    {
      name: 'segment-editor-api',
      partialize: ({ serverAddress, apiKey }) => ({ serverAddress, apiKey }),
      merge: (persisted, current) => {
        const p = persisted as Partial<ApiState> | null
        return {
          ...current,
          serverAddress: sanitize(p?.serverAddress) ?? '',
          apiKey: sanitize(p?.apiKey),
        }
      },
    },
  ),
)
