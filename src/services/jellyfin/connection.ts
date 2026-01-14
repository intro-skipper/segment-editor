/**
 * Connection testing and credential management.
 * Single Responsibility: Connection validation and credential resolution.
 * @module services/jellyfin/connection
 */

import {
  getPluginCredentials,
  getRequestConfig,
  isAborted,
  withApi,
} from './core'
import { sanitizeUrl } from './security'
import type {
  ApiOptions,
  AuthResult,
  ConnectionResult,
  Credentials,
} from './types'
import { useApiStore } from '@/stores/api-store'
import { AppError, ErrorCodes, isAbortError } from '@/lib/unified-error'

// ─────────────────────────────────────────────────────────────────────────────
// Credential Resolution
// ─────────────────────────────────────────────────────────────────────────────

/** Gets current credentials from plugin context or store. */
export function getCredentials(): Credentials {
  const pluginCreds = getPluginCredentials()
  if (pluginCreds) return pluginCreds

  const { serverAddress, apiKey } = useApiStore.getState()
  return { serverAddress, accessToken: apiKey ?? '' }
}

export function getServerBaseUrl(): string {
  return sanitizeUrl(getCredentials().serverAddress) ?? ''
}

export function getAccessToken(): string {
  return getCredentials().accessToken
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth Result Storage
// ─────────────────────────────────────────────────────────────────────────────

/** Stores successful authentication result in the API store. */
export function storeAuthResult(
  serverAddress: string,
  result: AuthResult,
  authMethod: 'apiKey' | 'userPass',
): void {
  if (!result.success || !result.accessToken) return

  const store = useApiStore.getState()

  store.setServerAddress(serverAddress)
  store.setApiKey(result.accessToken)
  store.setAuthMethod(authMethod)

  if (result.serverVersion) {
    store.setServerVersion(result.serverVersion)
  }

  if (result.userId && result.username) {
    store.setUserInfo(result.userId, result.username)
  }

  store.setConnectionStatus(true, true)
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection Testing
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_RESULT: ConnectionResult = {
  valid: false,
  authenticated: false,
  serverVersion: '',
}

/** Tests connection with explicit credentials. */
export async function testConnectionWithCredentials(
  credentials: Credentials,
  options?: ApiOptions,
): Promise<ConnectionResult> {
  if (isAborted(options?.signal)) return DEFAULT_RESULT
  if (!credentials.serverAddress.trim() || !credentials.accessToken.trim()) {
    return DEFAULT_RESULT
  }

  try {
    const version = await withApi(
      async ({ systemApi }) => {
        const { data } = await systemApi.getSystemInfo(
          getRequestConfig(options),
        )
        return data.Version ?? ''
      },
      options,
      credentials,
    )

    if (version === null) return DEFAULT_RESULT

    return { valid: true, authenticated: true, serverVersion: version }
  } catch (error) {
    if (isAbortError(error) || isAborted(options?.signal)) {
      return DEFAULT_RESULT
    }

    if (AppError.from(error).code === ErrorCodes.UNAUTHORIZED) {
      return { valid: true, authenticated: false, serverVersion: '' }
    }

    return DEFAULT_RESULT
  }
}

/** Tests connection using stored credentials and updates store state. */
export async function testConnection(
  options?: ApiOptions,
): Promise<ConnectionResult> {
  const store = useApiStore.getState()
  const { serverAddress, apiKey } = store

  if (isAborted(options?.signal)) return DEFAULT_RESULT

  if (!serverAddress.trim() || !apiKey?.trim()) {
    store.setConnectionStatus(false, false)
    return DEFAULT_RESULT
  }

  const result = await testConnectionWithCredentials(
    { serverAddress, accessToken: apiKey },
    options,
  )

  if (result.valid && result.authenticated) {
    store.setServerVersion(result.serverVersion)
    store.setConnectionStatus(true, true)
  } else if (result.valid) {
    store.setConnectionStatus(true, false)
  } else {
    store.setConnectionStatus(false, false)
  }

  return result
}
