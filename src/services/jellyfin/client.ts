/**
 * Jellyfin connection testing service.
 * Most API functionality has moved to sdk.ts.
 * This file provides connection testing and re-exports for backward compatibility.
 *
 * Features:
 * - Request cancellation via AbortController
 * - Timeout handling
 * - Graceful error handling
 */

import { useApiStore } from '@/stores/api-store'
import { getTypedApis, buildUrl as sdkBuildUrl } from '@/services/jellyfin/sdk'
import { API_CONFIG } from '@/lib/constants'
import { AppError, isAbortError } from '@/lib/unified-error'

/**
 * Options for connection testing.
 */
export interface ConnectionTestOptions {
  /** AbortSignal for request cancellation */
  signal?: AbortSignal
  /** Custom timeout in milliseconds */
  timeout?: number
}

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
  /** Whether the request was cancelled */
  cancelled?: boolean
}

/**
 * Tests the connection to the Jellyfin server.
 * Updates the API store with connection status.
 * @param options - Optional connection test options including AbortSignal
 * @returns Connection result with validity and server version
 */
export async function testConnection(
  options?: ConnectionTestOptions,
): Promise<ConnectionResult> {
  const store = useApiStore.getState()

  // Check if already aborted
  if (options?.signal?.aborted) {
    return {
      valid: false,
      authenticated: false,
      serverVersion: '',
      cancelled: true,
    }
  }

  try {
    const apis = getTypedApis()

    if (!apis) {
      store.setConnectionStatus(false, false)
      return {
        valid: false,
        authenticated: false,
        serverVersion: '',
      }
    }

    const response = await apis.systemApi.getSystemInfo({
      signal: options?.signal,
      timeout: options?.timeout ?? API_CONFIG.DEFAULT_TIMEOUT_MS,
    })
    const data = response.data

    const serverVersion = data.Version ?? ''
    store.setServerVersion(serverVersion)
    store.setConnectionStatus(true, true)

    return {
      valid: true,
      authenticated: true,
      serverVersion,
    }
  } catch (error) {
    // Handle cancellation silently
    if (isAbortError(error)) {
      return {
        valid: false,
        authenticated: false,
        serverVersion: '',
        cancelled: true,
      }
    }

    // Use AppError for consistent error handling
    const appError = AppError.from(error, 'Connection test failed')
    console.error(`[Connection] ${appError.message}`, {
      code: appError.code,
      recoverable: appError.recoverable,
    })

    // Check if it's an auth error (401)
    if (appError.code === 'UNAUTHORIZED') {
      store.setConnectionStatus(true, false)
      return {
        valid: true,
        authenticated: false,
        serverVersion: '',
      }
    }

    store.setConnectionStatus(false, false)
    return {
      valid: false,
      authenticated: false,
      serverVersion: '',
    }
  }
}

// Re-export buildUrl for backward compatibility
export { sdkBuildUrl as buildUrl }
