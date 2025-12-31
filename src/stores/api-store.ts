import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Jellyfin ApiClient interface for plugin mode detection.
 * When running as a Jellyfin plugin, window.ApiClient is available.
 */
interface JellyfinApiClient {
  _serverAddress?: string
  _serverInfo?: {
    AccessToken?: string
  }
}

declare global {
  interface Window {
    ApiClient?: JellyfinApiClient
  }
}

/**
 * API connection state and actions.
 * Manages server connection settings and authentication status.
 */
export interface ApiState {
  /** Jellyfin server address (URL) */
  serverAddress: string
  /** API key for authentication */
  apiKey: string | undefined
  /** Server version string */
  serverVersion: string
  /** Whether the server connection is valid */
  validConnection: boolean
  /** Whether authentication is valid */
  validAuth: boolean
  /** Whether running as a Jellyfin plugin */
  isPluginMode: boolean
}

export interface ApiActions {
  /** Set the server address */
  setServerAddress: (address: string) => void
  /** Set the API key */
  setApiKey: (key: string | undefined) => void
  /** Set the server version */
  setServerVersion: (version: string) => void
  /** Set connection and auth status */
  setConnectionStatus: (valid: boolean, auth: boolean) => void
  /** Initialize plugin mode detection */
  initPluginMode: () => void
  /** Reset connection state */
  resetConnection: () => void
}

export type ApiStore = ApiState & ApiActions

/**
 * Detects if running in Jellyfin plugin mode by checking for window.ApiClient.
 * Returns plugin configuration if available.
 */
function detectPluginMode(): {
  isPluginMode: boolean
  serverAddress?: string
  apiKey?: string
} {
  if (typeof window !== 'undefined' && window.ApiClient) {
    const apiClient = window.ApiClient
    return {
      isPluginMode: true,
      serverAddress: apiClient._serverAddress,
      apiKey: apiClient._serverInfo?.AccessToken,
    }
  }
  return { isPluginMode: false }
}

const initialState: ApiState = {
  serverAddress: '',
  apiKey: undefined,
  serverVersion: '',
  validConnection: false,
  validAuth: false,
  isPluginMode: false,
}

/**
 * Zustand store for API connection state.
 * Persists server address and API key to localStorage.
 */
export const useApiStore = create<ApiStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setServerAddress: (address: string) => {
        set({ serverAddress: address })
      },

      setApiKey: (key: string | undefined) => {
        set({ apiKey: key })
      },

      setServerVersion: (version: string) => {
        set({ serverVersion: version })
      },

      setConnectionStatus: (valid: boolean, auth: boolean) => {
        set({ validConnection: valid, validAuth: auth })
      },

      initPluginMode: () => {
        const pluginConfig = detectPluginMode()
        if (pluginConfig.isPluginMode) {
          set({
            isPluginMode: true,
            serverAddress: pluginConfig.serverAddress ?? get().serverAddress,
            apiKey: pluginConfig.apiKey ?? get().apiKey,
          })
        }
      },

      resetConnection: () => {
        set({
          validConnection: false,
          validAuth: false,
          serverVersion: '',
        })
      },
    }),
    {
      name: 'segment-editor-api',
      partialize: (state) => ({
        serverAddress: state.serverAddress,
        apiKey: state.apiKey,
      }),
    },
  ),
)
