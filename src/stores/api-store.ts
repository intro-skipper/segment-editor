import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { z } from 'zod'

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

/**
 * The persisted connection slice, decoded on rehydrate. Fields written by an
 * older build fall back to their defaults rather than entering the store raw.
 */
const PersistedApiSchema = z.object({
  serverAddress: z.string().catch(''),
  apiKey: z.string().optional().catch(undefined),
  authMethod: z.enum(['apiKey', 'userPass']).catch('apiKey'),
  userId: z.string().optional().catch(undefined),
  username: z.string().optional().catch(undefined),
})

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
        const decoded = PersistedApiSchema.safeParse(persisted)
        if (!decoded.success) return current

        const p = decoded.data
        return {
          ...current,
          serverAddress: p.serverAddress.trim(),
          apiKey: sanitizeKey(p.apiKey),
          authMethod: p.authMethod,
          userId: p.userId,
          username: p.username,
        }
      },
    },
  ),
)
