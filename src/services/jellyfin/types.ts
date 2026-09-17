/**
 * Jellyfin service type definitions.
 * Single Responsibility: Type definitions only - no runtime code.
 * @module services/jellyfin/types
 */

import type { Api } from '@jellyfin/sdk'
import type {
  getImageApi,
  getLibraryApi,
  getLibraryStructureApi,
  getSearchApi,
  getSessionApi,
  getShowApi,
  getSystemApi,
} from '@jellyfin/sdk/lib/utils/api'

export interface Credentials {
  serverAddress: string
  accessToken: string
}

export interface ApiOptions {
  signal?: AbortSignal
  timeout?: number
}

export interface TypedApis {
  api: Api
  systemApi: ReturnType<typeof getSystemApi>
  libraryApi: ReturnType<typeof getLibraryApi>
  libraryStructureApi: ReturnType<typeof getLibraryStructureApi>
  imageApi: ReturnType<typeof getImageApi>
  showApi: ReturnType<typeof getShowApi>
  searchApi: ReturnType<typeof getSearchApi>
  sessionApi: ReturnType<typeof getSessionApi>
}

interface ApiKeyCredentials {
  method: 'apiKey'
  apiKey: string
}

interface UserPassCredentials {
  method: 'userPass'
  username: string
  password: string
}

export type AuthCredentials = ApiKeyCredentials | UserPassCredentials

export interface AuthResult {
  success: boolean
  accessToken?: string
  userId?: string
  username?: string
  serverVersion?: string
  error?: string
}

export interface ConnectionResult {
  valid: boolean
  authenticated: boolean
  serverVersion: string
}

export interface JellyfinApiClient {
  serverAddress?: () => string
  accessToken?: () => string
  appName?: () => string
  appVersion?: () => string
  deviceName?: () => string
  deviceId?: () => string
  _serverAddress?: string
  _serverInfo?: { AccessToken?: string }
}

declare global {
  interface Window {
    ApiClient?: JellyfinApiClient
  }
}
