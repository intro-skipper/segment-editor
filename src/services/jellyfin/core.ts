/**
 * Core Jellyfin SDK client and API factory.
 * Single Responsibility: SDK initialization and API instance management.
 * @module services/jellyfin/core
 */

import { Jellyfin } from '@jellyfin/sdk'
import {
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
import { sanitizeUrl } from './security'
import type { Api } from '@jellyfin/sdk'
import type {
  ApiOptions,
  Credentials,
  JellyfinApiClient,
  TypedApis,
} from './types'
import { generateUUID } from '@/lib/segment-utils'
import { AppError, isAbortError } from '@/lib/unified-error'
import { API_CONFIG } from '@/lib/constants'

// ─────────────────────────────────────────────────────────────────────────────
// Constants & State
// ─────────────────────────────────────────────────────────────────────────────

const CLIENT_INFO = { name: 'Segment Editor', version: '1.0.0' } as const
const DEVICE_ID_KEY = 'segment-editor-device-id'
const PLUGIN_CONFIGURATION_PATH = '/configurationpage'

export const PLUGIN_ROUTER_BASE_PATH = PLUGIN_CONFIGURATION_PATH
export const PLUGIN_ROUTER_ENTRY =
  '/configurationpage?name=Segment%20Editor' as const

let jellyfinInstance: Jellyfin | null = null
let apiCache: { key: string; apis: TypedApis } | null = null
let credentialResolver: (() => Credentials | null) | null = null

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

/** Sets the credential resolver for automatic credential lookup. */
export function setCredentialResolver(
  resolver: () => Credentials | null,
): void {
  credentialResolver = resolver
}

// ─────────────────────────────────────────────────────────────────────────────
// Device & Plugin Detection
// ─────────────────────────────────────────────────────────────────────────────

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = generateUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

function getDeviceName(): string {
  return navigator.userAgent.split(' ')[0] || 'Browser'
}

function getPluginApiClient(): JellyfinApiClient | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return window.parent.ApiClient ?? window.ApiClient
  } catch {
    return window.ApiClient
  }
}

export function getPluginCredentials(): Credentials | null {
  const client = getPluginApiClient()
  if (!client) return null

  const serverAddress = client.serverAddress?.() ?? client._serverAddress ?? ''
  const accessToken =
    client.accessToken?.() ?? client._serverInfo?.AccessToken ?? ''

  return serverAddress && accessToken ? { serverAddress, accessToken } : null
}

export const isPluginMode = (): boolean => getPluginApiClient() !== undefined

// ─────────────────────────────────────────────────────────────────────────────
// Client Factory
// ─────────────────────────────────────────────────────────────────────────────

export function getJellyfinClient(): Jellyfin {
  if (!jellyfinInstance) {
    const plugin = getPluginApiClient()
    jellyfinInstance = new Jellyfin({
      clientInfo: {
        name: plugin?.appName?.() ?? CLIENT_INFO.name,
        version: plugin?.appVersion?.() ?? CLIENT_INFO.version,
      },
      deviceInfo: {
        name: plugin?.deviceName?.() ?? getDeviceName(),
        id: plugin?.deviceId?.() ?? getDeviceId(),
      },
    })
  }
  return jellyfinInstance
}

// ─────────────────────────────────────────────────────────────────────────────
// API Factory (DRY: single implementation)
// ─────────────────────────────────────────────────────────────────────────────

function createTypedApis(api: Api): TypedApis {
  return {
    api,
    systemApi: getSystemApi(api),
    itemsApi: getItemsApi(api),
    libraryApi: getLibraryApi(api),
    libraryStructureApi: getLibraryStructureApi(api),
    imageApi: getImageApi(api),
    videosApi: getVideosApi(api),
    tvShowsApi: getTvShowsApi(api),
    pluginsApi: getPluginsApi(api),
    mediaSegmentsApi: getMediaSegmentsApi(api),
    searchApi: getSearchApi(api),
    playstateApi: getPlaystateApi(api),
  }
}

/** Creates a raw API instance without caching. */
export function createApi(
  serverAddress: string,
  accessToken?: string,
): Api | null {
  const base = sanitizeUrl(serverAddress)
  return base ? getJellyfinClient().createApi(base, accessToken) : null
}

/** Gets or creates a cached TypedApis instance for the given credentials. */
function getTypedApis(credentials: Credentials): TypedApis | null {
  const key = `${credentials.serverAddress}:${credentials.accessToken}`

  if (apiCache?.key === key) return apiCache.apis

  const base = sanitizeUrl(credentials.serverAddress)
  if (!base) {
    apiCache = null
    return null
  }

  const api = getJellyfinClient().createApi(
    base,
    credentials.accessToken || undefined,
  )
  const apis = createTypedApis(api)
  apiCache = { key, apis }
  return apis
}

export function clearApiCache(): void {
  apiCache = null
}

// ─────────────────────────────────────────────────────────────────────────────
// Request Utilities
// ─────────────────────────────────────────────────────────────────────────────

export const isAborted = (signal?: AbortSignal): boolean =>
  signal?.aborted === true

export function getRequestConfig(
  options?: ApiOptions,
  defaultTimeout: number = API_CONFIG.DEFAULT_TIMEOUT_MS,
): { signal?: AbortSignal; timeout: number } {
  return {
    signal: options?.signal,
    timeout: options?.timeout ?? defaultTimeout,
  }
}

/**
 * Gets request config with authentication headers for direct axios calls.
 * Use this when making calls with apis.api.axiosInstance directly.
 */
export function getAuthenticatedRequestConfig(
  accessToken: string | undefined,
  options?: ApiOptions,
  defaultTimeout: number = API_CONFIG.DEFAULT_TIMEOUT_MS,
): { signal?: AbortSignal; timeout: number; headers?: Record<string, string> } {
  const config: {
    signal?: AbortSignal
    timeout: number
    headers?: Record<string, string>
  } = {
    signal: options?.signal,
    timeout: options?.timeout ?? defaultTimeout,
  }

  if (accessToken) {
    config.headers = {
      Authorization: `MediaBrowser Token="${accessToken}"`,
    }
  }

  return config
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified API Wrapper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executes an API operation with automatic credential resolution and error handling.
 * Returns null on abort or missing credentials, throws AppError on other failures.
 */
export async function withApi<T>(
  fn: (apis: TypedApis) => Promise<T>,
  options?: ApiOptions,
  credentials?: Credentials,
): Promise<T | null> {
  if (isAborted(options?.signal)) return null

  const creds = credentials ?? credentialResolver?.() ?? null
  if (!creds) return null

  const apis = getTypedApis(creds)
  if (!apis) return null

  try {
    return await fn(apis)
  } catch (error) {
    if (isAbortError(error)) return null
    throw AppError.from(error)
  }
}
