/**
 * Jellyfin connection testing service.
 *
 * Provides connection validation with:
 * - Request cancellation via AbortController
 * - Timeout handling
 * - Graceful error handling
 */

import type { ApiOptions } from '@/services/jellyfin/sdk'
import {
  getRequestConfig,
  withApi,
} from '@/services/jellyfin/sdk'
import { useApiStore } from '@/stores/api-store'
import { AppError, isAbortError } from '@/lib/unified-error'

/** Result of a connection test */
export interface ConnectionResult {
  valid: boolean
  authenticated: boolean
  serverVersion: string
  cancelled?: boolean
}

const CANCELLED_RESULT: ConnectionResult = {
  valid: false,
  authenticated: false,
  serverVersion: '',
  cancelled: true,
}

const FAILED_RESULT: ConnectionResult = {
  valid: false,
  authenticated: false,
  serverVersion: '',
}

/**
 * Tests the connection to the Jellyfin server.
 * Updates the API store with connection status.
 */
export async function testConnection(
  options?: ApiOptions,
): Promise<ConnectionResult> {
  const store = useApiStore.getState()

  try {
    const result = await withApi(
      async (apis) => {
        const { data } = await apis.systemApi.getSystemInfo(
          getRequestConfig(options),
        )
        return data.Version ?? ''
      },
      options,
    )

    // withApi returns null on abort or unavailable
    if (result === null) {
      if (options?.signal?.aborted) return CANCELLED_RESULT
      store.setConnectionStatus(false, false)
      return FAILED_RESULT
    }

    store.setServerVersion(result)
    store.setConnectionStatus(true, true)
    return { valid: true, authenticated: true, serverVersion: result }
  } catch (error) {
    if (isAbortError(error)) return CANCELLED_RESULT

    const appError = AppError.from(error, 'Connection test failed')
    console.error(`[Connection] ${appError.message}`, {
      code: appError.code,
      recoverable: appError.recoverable,
    })

    // 401 = server reachable but auth failed
    if (appError.code === 'UNAUTHORIZED') {
      store.setConnectionStatus(true, false)
      return { valid: true, authenticated: false, serverVersion: '' }
    }

    store.setConnectionStatus(false, false)
    return FAILED_RESULT
  }
}
