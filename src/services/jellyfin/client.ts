/**
 * Jellyfin API client service.
 * Handles all HTTP communication with the Jellyfin server.
 * Supports both standalone and plugin deployment modes.
 */

import { useApiStore } from '@/stores/api-store'

/**
 * Result of a connection test.
 */
export interface ConnectionResult {
  /** Whether the server is reachable */
  valid: boolean
  /** Whether authentication is valid */
  authenticated: boolean
  /** Server version string */
  serverVersion: string
}

/**
 * API error with status and message.
 */
export interface ApiError {
  status: number
  message: string
  endpoint: string
}

/**
 * Gets the plugin auth header if running in plugin mode.
 * When running as a Jellyfin plugin, window.ApiClient provides the access token.
 */
function getPluginAuthHeader(): HeadersInit | undefined {
  if (typeof window !== 'undefined' && window.ApiClient) {
    const token = window.ApiClient._serverInfo?.AccessToken
    if (token) {
      return { 'MediaBrowser Token': token }
    }
  }
  return undefined
}

/**
 * Builds a URL with query parameters and authentication.
 * @param endpoint - API endpoint (e.g., 'System/Info')
 * @param query - Optional query parameters
 * @returns Full URL string
 */
export function buildUrl(
  endpoint: string,
  query?: URLSearchParams | Map<string, string>,
): string {
  const { serverAddress, apiKey, isPluginMode } = useApiStore.getState()

  // Convert Map to URLSearchParams if needed
  let params: URLSearchParams
  if (query instanceof Map) {
    params = new URLSearchParams()
    query.forEach((value, key) => params.append(key, value))
  } else {
    params = query ? new URLSearchParams(query) : new URLSearchParams()
  }

  // Add API key if not in plugin mode
  if (!isPluginMode && apiKey) {
    params.append('ApiKey', apiKey)
  }

  const queryString = params.toString()
  const separator = queryString ? '?' : ''

  // Ensure server address doesn't have trailing slash
  const baseUrl = serverAddress.replace(/\/$/, '')

  return `${baseUrl}/${endpoint}${separator}${queryString}`
}

/**
 * Creates request headers with authentication.
 * @param contentType - Optional content type header
 * @returns Headers object
 */
function createHeaders(contentType?: string): HeadersInit {
  const headers: HeadersInit = {}

  if (contentType) {
    headers['Content-Type'] = contentType
  }

  // Add plugin auth header if available
  const pluginAuth = getPluginAuthHeader()
  if (pluginAuth) {
    Object.assign(headers, pluginAuth)
  }

  return headers
}

/**
 * Tests the connection to the Jellyfin server.
 * Updates the API store with connection status.
 * @returns Connection result with validity and server version
 */
export async function testConnection(): Promise<ConnectionResult> {
  const store = useApiStore.getState()

  try {
    const response = await fetch(buildUrl('System/Info'), {
      method: 'GET',
      headers: createHeaders(),
    })

    const authenticated = response.status !== 401
    const valid = response.ok

    if (valid) {
      const data = await response.json()
      store.setServerVersion(data.Version || '')
      store.setConnectionStatus(true, authenticated)

      return {
        valid: true,
        authenticated,
        serverVersion: data.Version || '',
      }
    }

    store.setConnectionStatus(false, false)
    return {
      valid: false,
      authenticated: false,
      serverVersion: '',
    }
  } catch (error) {
    console.error('Connection test failed:', error)
    store.setConnectionStatus(false, false)

    return {
      valid: false,
      authenticated: false,
      serverVersion: '',
    }
  }
}

/**
 * Performs a GET request with authentication.
 * @param endpoint - API endpoint
 * @param query - Optional query parameters
 * @returns Parsed JSON response
 * @throws ApiError on failure
 */
export async function fetchWithAuth<T>(
  endpoint: string,
  query?: URLSearchParams | Map<string, string>,
): Promise<T> {
  const store = useApiStore.getState()

  const response = await fetch(buildUrl(endpoint, query), {
    method: 'GET',
    headers: createHeaders(),
  })

  if (response.status === 401) {
    store.setConnectionStatus(store.validConnection, false)
    throw {
      status: 401,
      message: 'Authentication failed',
      endpoint,
    } as ApiError
  }

  if (!response.ok) {
    throw {
      status: response.status,
      message: response.statusText || 'Request failed',
      endpoint,
    } as ApiError
  }

  // Handle empty responses
  const text = await response.text()
  if (!text || text.length === 0) {
    return {} as T
  }

  return JSON.parse(text) as T
}

/**
 * Performs a POST request with JSON body.
 * @param endpoint - API endpoint
 * @param body - Optional request body (will be JSON stringified)
 * @param query - Optional query parameters
 * @returns Parsed JSON response or false on failure
 */
export async function postJson<T>(
  endpoint: string,
  body?: unknown,
  query?: URLSearchParams | Map<string, string>,
): Promise<T | false> {
  const store = useApiStore.getState()

  const response = await fetch(buildUrl(endpoint, query), {
    method: 'POST',
    headers: createHeaders('application/json'),
    body: body ? JSON.stringify(body) : undefined,
  })

  // Handle authentication failure
  if (response.status === 401) {
    store.setConnectionStatus(store.validConnection, false)
    return false
  }

  // Handle bad request
  if (response.status === 400) {
    return false
  }

  // Handle not found
  if (response.status === 404) {
    return false
  }

  // Handle success
  if (response.ok) {
    const text = await response.text()
    if (!text || text.length === 0) {
      return {} as T
    }
    try {
      return JSON.parse(text) as T
    } catch {
      return {} as T
    }
  }

  return false
}

/**
 * Performs a DELETE request with optional JSON body.
 * @param endpoint - API endpoint
 * @param body - Optional request body (will be JSON stringified)
 * @param query - Optional query parameters
 * @returns Parsed JSON response or boolean indicating success
 */
export async function deleteJson<T>(
  endpoint: string,
  body?: unknown,
  query?: URLSearchParams | Map<string, string>,
): Promise<T | boolean> {
  const store = useApiStore.getState()

  const headers = body ? createHeaders('application/json') : createHeaders()

  const response = await fetch(buildUrl(endpoint, query), {
    method: 'DELETE',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  // Handle authentication failure
  if (response.status === 401) {
    store.setConnectionStatus(store.validConnection, false)
    return false
  }

  store.setConnectionStatus(response.ok, store.validAuth)

  // Try to parse JSON response
  try {
    const text = await response.text()
    if (text && text.length > 0) {
      return JSON.parse(text) as T
    }
  } catch {
    // Ignore parse errors
  }

  return response.ok
}

/**
 * Jellyfin client class for object-oriented usage.
 * Wraps the functional API for convenience.
 */
export class JellyfinClient {
  /**
   * Tests the connection to the Jellyfin server.
   */
  async testConnection(): Promise<ConnectionResult> {
    return testConnection()
  }

  /**
   * Performs a GET request with authentication.
   */
  async fetchWithAuth<T>(
    endpoint: string,
    query?: URLSearchParams | Map<string, string>,
  ): Promise<T> {
    return fetchWithAuth<T>(endpoint, query)
  }

  /**
   * Performs a POST request with JSON body.
   */
  async postJson<T>(
    endpoint: string,
    body?: unknown,
    query?: URLSearchParams | Map<string, string>,
  ): Promise<T | false> {
    return postJson<T>(endpoint, body, query)
  }

  /**
   * Performs a DELETE request with optional JSON body.
   */
  async deleteJson<T>(
    endpoint: string,
    body?: unknown,
    query?: URLSearchParams | Map<string, string>,
  ): Promise<T | boolean> {
    return deleteJson<T>(endpoint, body, query)
  }

  /**
   * Builds a URL with query parameters and authentication.
   */
  buildUrl(
    endpoint: string,
    query?: URLSearchParams | Map<string, string>,
  ): string {
    return buildUrl(endpoint, query)
  }
}

/**
 * Singleton instance of the Jellyfin client.
 */
export const jellyfinClient = new JellyfinClient()
