import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AuthMethod = 'apiKey' | 'userPass'

interface ApiState {
  serverAddress: string
  apiKey: string | undefined
  serverVersion: string
  validConnection: boolean
  validAuth: boolean
  authMethod: AuthMethod
  userId: string | undefined
  username: string | undefined
}

interface ApiActions {
  setServerAddress: (address: string) => void
  setApiKey: (key: string | undefined) => void
  setServerVersion: (version: string) => void
  setConnectionStatus: (valid: boolean, auth: boolean) => void
  resetConnection: () => void
  setAuthMethod: (method: AuthMethod) => void
  setUserInfo: (userId: string, username: string) => void
  clearAuth: () => void
}

type ApiStore = ApiState & ApiActions

const initialState: ApiState = {
  serverAddress: '',
  apiKey: undefined,
  serverVersion: '',
  validConnection: false,
  validAuth: false,
  authMethod: 'apiKey',
  userId: undefined,
  username: undefined,
}

/** Sanitizes API key by trimming whitespace */
const sanitizeKey = (val: string | undefined): string | undefined =>
  val?.trim() || undefined

export const useApiStore = create<ApiStore>()(
  persist(
    (set) => ({
      ...initialState,
      setServerAddress: (serverAddress) =>
        set({ serverAddress: serverAddress.trim() }),
      setApiKey: (apiKey) => set({ apiKey: sanitizeKey(apiKey) }),
      setServerVersion: (serverVersion) => set({ serverVersion }),
      setConnectionStatus: (validConnection, validAuth) =>
        set({ validConnection, validAuth }),
      resetConnection: () =>
        set({ validConnection: false, validAuth: false, serverVersion: '' }),
      setAuthMethod: (authMethod) => set({ authMethod }),
      setUserInfo: (userId, username) => set({ userId, username }),
      clearAuth: () =>
        set({
          apiKey: undefined,
          userId: undefined,
          username: undefined,
          validConnection: false,
          validAuth: false,
          serverVersion: '',
        }),
    }),
    {
      name: 'segment-editor-api',
      partialize: ({
        serverAddress,
        apiKey,
        authMethod,
        userId,
        username,
      }) => ({
        serverAddress,
        apiKey,
        authMethod,
        userId,
        username,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<ApiState> | null
        return {
          ...current,
          serverAddress: p?.serverAddress?.trim() ?? '',
          apiKey: sanitizeKey(p?.apiKey),
          authMethod: p?.authMethod ?? 'apiKey',
          userId: p?.userId,
          username: p?.username,
        }
      },
    },
  ),
)
