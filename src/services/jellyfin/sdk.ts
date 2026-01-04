/**
 * Jellyfin SDK client initialization.
 * Provides a unified API client that works in both standalone and plugin modes.
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

const CLIENT_INFO = { name: 'Segment Editor', version: '1.0.0' }
const DEVICE_ID_KEY = 'segment-editor-device-id'

function getDeviceInfo() {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY)
  if (!deviceId) {
    deviceId = generateUUID()
    localStorage.setItem(DEVICE_ID_KEY, deviceId)
  }
  return { name: navigator.userAgent.split(' ')[0] || 'Browser', id: deviceId }
}

export const getOrCreateDeviceId = (): string => getDeviceInfo().id

let jellyfinInstance: Jellyfin | null = null

function getJellyfin(): Jellyfin {
  if (!jellyfinInstance) {
    const apiClient =
      typeof window !== 'undefined' ? window.ApiClient : undefined
    const device = getDeviceInfo()
    jellyfinInstance = new Jellyfin({
      clientInfo: {
        name: apiClient?.appName?.() || CLIENT_INFO.name,
        version: apiClient?.appVersion?.() || CLIENT_INFO.version,
      },
      deviceInfo: {
        name: apiClient?.deviceName?.() || device.name,
        id: apiClient?.deviceId?.() || device.id,
      },
    })
  }
  return jellyfinInstance
}

function getPluginCredentials(): {
  serverAddress: string
  accessToken: string
} | null {
  const apiClient = typeof window !== 'undefined' ? window.ApiClient : undefined
  if (!apiClient) return null
  const serverAddress =
    apiClient.serverAddress?.() || apiClient._serverAddress || ''
  const accessToken =
    apiClient.accessToken?.() || apiClient._serverInfo?.AccessToken || ''
  return serverAddress && accessToken ? { serverAddress, accessToken } : null
}

function getCredentials() {
  const pluginCreds = getPluginCredentials()
  if (pluginCreds) return pluginCreds
  const { serverAddress, apiKey } = useApiStore.getState()
  return { serverAddress: serverAddress || '', accessToken: apiKey || '' }
}

export function getApi(): Api | null {
  const { serverAddress, accessToken } = getCredentials()
  const sanitizedBase = sanitizeUrl(serverAddress)
  return sanitizedBase
    ? getJellyfin().createApi(sanitizedBase, accessToken || undefined)
    : null
}

export const isPluginMode = (): boolean => getPluginCredentials() !== null

/** Return type for getTypedApis */
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

export function getTypedApis(): TypedApis | null {
  const api = getApi()
  if (!api) return null
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
 * Gets typed APIs or throws AppError if unavailable.
 * Use this when API availability is required (will throw on failure).
 * For optional API access, use getTypedApis() which returns null.
 */
export function requireTypedApis(): TypedApis {
  const apis = getTypedApis()
  if (!apis) {
    // Import dynamically to avoid circular dependency
    const { AppError } = require('@/lib/unified-error')
    throw AppError.unavailable()
  }
  return apis
}

export function getServerBaseUrl(): string {
  return sanitizeUrl(getCredentials().serverAddress) ?? ''
}

export function getAccessToken(): string {
  return getCredentials().accessToken
}

// Security patterns
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])
const DANGEROUS_PROTOCOLS = [
  /^javascript:/i,
  /^data:/i,
  /^vbscript:/i,
  /^file:/i,
]
const PATH_TRAVERSAL = /(?:^|[\\/])\.\.(?:[\\/]|$)/
const ENCODED_TRAVERSAL = /%2e%2e|%252e%252e|%c0%ae|%c1%9c/i
// eslint-disable-next-line no-control-regex -- Intentionally checking for dangerous control characters
const DANGEROUS_CHARS = /[\x00-\x1f\x7f]/

export function sanitizeUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim()
  if (!trimmed || DANGEROUS_CHARS.test(trimmed)) return null

  let decoded: string
  try {
    decoded = decodeURIComponent(trimmed)
  } catch {
    decoded = trimmed
  }

  const lower = trimmed.toLowerCase()
  const lowerDecoded = decoded.toLowerCase()
  if (DANGEROUS_PROTOCOLS.some((p) => p.test(lower) || p.test(lowerDecoded)))
    return null

  try {
    const parsed = new URL(trimmed)
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null
    if (
      PATH_TRAVERSAL.test(parsed.pathname) ||
      PATH_TRAVERSAL.test(decodeURIComponent(parsed.pathname))
    )
      return null
    if (ENCODED_TRAVERSAL.test(parsed.pathname)) return null
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
  if (DANGEROUS_CHARS.test(str)) return ''
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
}

const UNSAFE_PATH = /^\/+|\.{2,}/g
const ENDPOINT_TRAVERSAL = /(?:^|[\\/])\.\.(?:[\\/]|$)|%2e%2e/i

export function buildUrl(
  endpoint: string,
  query?: URLSearchParams,
  includeAuth = true,
): string {
  const { serverAddress, accessToken } = getCredentials()
  const sanitizedBase = sanitizeUrl(serverAddress)
  if (!sanitizedBase) return ''

  if (ENDPOINT_TRAVERSAL.test(endpoint)) {
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

  const safeEndpoint = endpoint.replace(UNSAFE_PATH, '')
  const qs = params.toString()
  return `${sanitizedBase}/${safeEndpoint}${qs ? `?${qs}` : ''}`
}
