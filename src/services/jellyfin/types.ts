/**
 * Jellyfin service type definitions.
 * Single Responsibility: Type definitions only - no runtime code.
 * @module services/jellyfin/types
 */

import type { Api } from '@jellyfin/sdk'
import type {
  getImageApi,
  getItemsApi,
  getLibraryApi,
  getLibraryStructureApi,
  getMediaSegmentsApi,
  getPlaystateApi,
  getPluginsApi,
  getSearchApi,
  getSystemApi,
  getTvShowsApi,
  getVideosApi,
} from '@jellyfin/sdk/lib/utils/api'

// ─────────────────────────────────────────────────────────────────────────────
// Core Types
// ─────────────────────────────────────────────────────────────────────────────

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
  itemsApi: ReturnType<typeof getItemsApi>
  libraryApi: ReturnType<typeof getLibraryApi>
  libraryStructureApi: ReturnType<typeof getLibraryStructureApi>
  imageApi: ReturnType<typeof getImageApi>
  videosApi: ReturnType<typeof getVideosApi>
  tvShowsApi: ReturnType<typeof getTvShowsApi>
  pluginsApi: ReturnType<typeof getPluginsApi>
  mediaSegmentsApi: ReturnType<typeof getMediaSegmentsApi>
  searchApi: ReturnType<typeof getSearchApi>
  playstateApi: ReturnType<typeof getPlaystateApi>
}

// ─────────────────────────────────────────────────────────────────────────────
// Authentication Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiKeyCredentials {
  method: 'apiKey'
  apiKey: string
}

export interface UserPassCredentials {
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

// ─────────────────────────────────────────────────────────────────────────────
// Plugin Integration Types
// ─────────────────────────────────────────────────────────────────────────────

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
