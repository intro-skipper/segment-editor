/**
 * Jellyfin SDK client - unified API access layer.
 *
 * Architecture:
 * - Single Jellyfin instance (singleton)
 * - Cached typed API instances per credential set
 * - Automatic credential detection (plugin mode vs standalone)
 * - Comprehensive URL/query sanitization
 */

import { Jellyfin } from '@jellyfin/sdk'
import {
  getImageApi,
  getItemsApi,
  getLibraryApi,
  getLibraryStructureApi,
  getMediaSegmentsApi,
  getPluginsApi,
  getSearchApi,
  getSystemApi,
  getTvShowsApi,
  getVideosApi,
} from '@jellyfin/sdk/lib/utils/api'
import type { Api } from '@jellyfin/sdk'
import { useApiStore } from '@/stores/api-store'
import { generateUUID } from '@/lib/segment-utils'
import { AppError, isAbortError } from '@/lib/unified-error'
import { API_CONFIG } from '@/lib/constants'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface JellyfinApiClient {
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

// ─────────────────────────────────────────────────────────────────────────────
// Plugin Mode Detection (Jellyfin iframe context)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gets the Jellyfin ApiClient from the parent window (iframe context) or current window.
 * Jellyfin plugins run as iframes and access the parent's ApiClient.
 */
function getJellyfinApiClient(): JellyfinApiClient | undefined {
  if (typeof window === 'undefined') return undefined

  // First check parent window (iframe inside Jellyfin)
  try {
    const parentClient = window.parent.ApiClient
    if (parentClient) return parentClient
  } catch {
    // Cross-origin access blocked - not in same-origin iframe
  }

  // Fallback to current window (standalone or same-origin)
  return window.ApiClient
}

interface Credentials {
  serverAddress: string
  accessToken: string
}

/** Typed API collection for Jellyfin operations */
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
}

/** Options for API operations */
export interface ApiOptions {
  signal?: AbortSignal
  timeout?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CLIENT_INFO = { name: 'Segment Editor', version: '1.0.0' } as const
const DEVICE_ID_KEY = 'segment-editor-device-id'

// Security patterns - consolidated
const SECURITY = {
  allowedProtocols: new Set(['http:', 'https:']),
  dangerousProtocols: [/^javascript:/i, /^data:/i, /^vbscript:/i, /^file:/i],
  pathTraversal: /(?:^|[\\/])\.\.(?:[\\/]|$)/,
  encodedTraversal: /%2e%2e|%252e%252e|%c0%ae|%c1%9c/i,
  // eslint-disable-next-line no-control-regex
  dangerousChars: /[\x00-\x1f\x7f]/,
  unsafePath: /^\/+|\.{2,}/g,
  endpointTraversal: /(?:^|[\\/])\.\.(?:[\\/]|$)|%2e%2e/i,
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Singleton State
// ─────────────────────────────────────────────────────────────────────────────

let jellyfinInstance: Jellyfin | null = null
let cachedApis: { key: string; apis: TypedApis } | null = null

// ─────────────────────────────────────────────────────────────────────────────
// Device Management
// ─────────────────────────────────────────────────────────────────────────────

function getDeviceInfo(): { name: string; id: string } {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY)
  if (!deviceId) {
    deviceId = generateUUID()
    localStorage.setItem(DEVICE_ID_KEY, deviceId)
  }
  return { name: navigator.userAgent.split(' ')[0] || 'Browser', id: deviceId }
}

export const getOrCreateDeviceId = (): string => getDeviceInfo().id

// ─────────────────────────────────────────────────────────────────────────────
// Jellyfin Instance (Singleton)
// ─────────────────────────────────────────────────────────────────────────────

function getJellyfin(): Jellyfin {
  if (!jellyfinInstance) {
    const apiClient = getJellyfinApiClient()
    const device = getDeviceInfo()

    jellyfinInstance = new Jellyfin({
      clientInfo: {
        name: apiClient?.appName?.() ?? CLIENT_INFO.name,
        version: apiClient?.appVersion?.() ?? CLIENT_INFO.version,
      },
      deviceInfo: {
        name: apiClient?.deviceName?.() ?? device.name,
        id: apiClient?.deviceId?.() || device.id,
      },
    })
  }
  return jellyfinInstance
}

// ─────────────────────────────────────────────────────────────────────────────
// Credential Resolution
// ─────────────────────────────────────────────────────────────────────────────

function getPluginCredentials(): Credentials | null {
  const apiClient = getJellyfinApiClient()
  if (!apiClient) return null

  const serverAddress =
    apiClient.serverAddress?.() ?? apiClient._serverAddress ?? ''
  const accessToken =
    apiClient.accessToken?.() ?? apiClient._serverInfo?.AccessToken ?? ''

  return serverAddress && accessToken ? { serverAddress, accessToken } : null
}

function getCredentials(): Credentials {
  const pluginCreds = getPluginCredentials()
  if (pluginCreds) return pluginCreds

  const { serverAddress, apiKey } = useApiStore.getState()
  return { serverAddress, accessToken: apiKey ?? '' }
}

export const isPluginMode = (): boolean => getPluginCredentials() !== null
export const getServerBaseUrl = (): string =>
  sanitizeUrl(getCredentials().serverAddress) ?? ''
export const getAccessToken = (): string => getCredentials().accessToken

// ─────────────────────────────────────────────────────────────────────────────
// API Instance Management (Cached)
// ─────────────────────────────────────────────────────────────────────────────

function createApi(): Api | null {
  const { serverAddress, accessToken } = getCredentials()
  const sanitizedBase = sanitizeUrl(serverAddress)
  if (!sanitizedBase) return null

  return getJellyfin().createApi(sanitizedBase, accessToken || undefined)
}

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
  }
}

/**
 * Gets typed APIs with caching based on credentials.
 * Returns null if credentials are unavailable.
 * @internal Used by withApi - prefer withApi for external usage
 */
function getTypedApis(): TypedApis | null {
  const { serverAddress, accessToken } = getCredentials()
  const cacheKey = `${serverAddress}:${accessToken}`

  if (cachedApis?.key === cacheKey) return cachedApis.apis

  const api = createApi()
  if (!api) {
    cachedApis = null
    return null
  }

  const apis = createTypedApis(api)
  cachedApis = { key: cacheKey, apis }
  return apis
}

/** Clears the API cache (call on logout/credential change) */
export function clearApiCache(): void {
  cachedApis = null
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified API Call Wrapper (Single entry point for all API operations)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executes an API call with standardized error handling, abort support, and API availability check.
 * This is the single entry point for all API operations - eliminates repeated null checks.
 *
 * @param fn - Function receiving TypedApis, returns the API call result
 * @param options - Optional abort signal and timeout
 * @returns Result or null on abort/unavailable, throws AppError on failure
 */
export async function withApi<T>(
  fn: (apis: TypedApis) => Promise<T>,
  options?: ApiOptions,
): Promise<T | null> {
  if (options?.signal?.aborted) return null

  const apis = getTypedApis()
  if (!apis) return null

  try {
    return await fn(apis)
  } catch (error) {
    if (isAbortError(error)) return null
    throw AppError.from(error)
  }
}

/**
 * Creates standard request config from options.
 * Centralizes timeout and signal handling.
 */
export function getRequestConfig(
  options?: ApiOptions,
  defaultTimeout: number = API_CONFIG.DEFAULT_TIMEOUT_MS,
): { signal?: AbortSignal; timeout: number } {
  return {
    signal: options?.signal,
    timeout: options?.timeout ?? defaultTimeout,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// URL Sanitization
// ─────────────────────────────────────────────────────────────────────────────

export function sanitizeUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim()
  if (!trimmed || SECURITY.dangerousChars.test(trimmed)) return null

  let decoded: string
  try {
    decoded = decodeURIComponent(trimmed)
  } catch {
    decoded = trimmed
  }

  const lower = trimmed.toLowerCase()
  const lowerDecoded = decoded.toLowerCase()
  if (
    SECURITY.dangerousProtocols.some(
      (p) => p.test(lower) || p.test(lowerDecoded),
    )
  ) {
    return null
  }

  try {
    const parsed = new URL(trimmed)
    if (!SECURITY.allowedProtocols.has(parsed.protocol)) return null
    if (
      SECURITY.pathTraversal.test(parsed.pathname) ||
      SECURITY.pathTraversal.test(decodeURIComponent(parsed.pathname))
    ) {
      return null
    }
    if (SECURITY.encodedTraversal.test(parsed.pathname)) return null
    if (!parsed.hostname || parsed.hostname.includes('..')) return null

    const cleanPath = parsed.pathname.replace(/\/+$/, '').replace(/\/+/g, '/')
    return `${parsed.origin}${cleanPath}`
  } catch {
    return null
  }
}

export function sanitizeQueryParam(value: string | null | undefined): string {
  if (value == null) return ''
  const str = String(value)
  if (SECURITY.dangerousChars.test(str)) return ''
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
}

// ─────────────────────────────────────────────────────────────────────────────
// URL Building
// ─────────────────────────────────────────────────────────────────────────────

export function buildUrl(
  endpoint: string,
  query?: URLSearchParams,
  includeAuth = true,
): string {
  const { serverAddress, accessToken } = getCredentials()
  const sanitizedBase = sanitizeUrl(serverAddress)
  if (!sanitizedBase) return ''

  if (SECURITY.endpointTraversal.test(endpoint)) {
    console.warn('Blocked path traversal in endpoint:', endpoint)
    return ''
  }

  const params = new URLSearchParams()
  if (query) {
    for (const [key, value] of query.entries()) {
      const sanitized = sanitizeQueryParam(value)
      if (sanitized) params.set(key, sanitized)
    }
  }
  if (includeAuth && accessToken) params.set('ApiKey', accessToken)

  const safeEndpoint = endpoint.replace(SECURITY.unsafePath, '')
  const qs = params.toString()
  return `${sanitizedBase}/${safeEndpoint}${qs ? `?${qs}` : ''}`
}
