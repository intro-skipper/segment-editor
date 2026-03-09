/**
 * Jellyfin authentication service.
 * Single Responsibility: Authentication flows and credential validation.
 * @module services/jellyfin/auth
 */

import { getSystemApi, getUserApi } from '@jellyfin/sdk/lib/utils/api'
import { createApi, getRequestConfig, isAborted } from './core'
import type { ApiOptions, AuthCredentials, AuthResult } from './types'
import { ConnectionAuthSchema } from '@/lib/forms/connection-form'
import { AppError, ErrorCodes, isAbortError } from '@/lib/unified-error'

// ─────────────────────────────────────────────────────────────────────────────
// Error Messages (DRY: single source of truth)
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  [ErrorCodes.UNAUTHORIZED]: 'Invalid credentials',
  [ErrorCodes.FORBIDDEN]: 'Access denied',
  [ErrorCodes.NETWORK_ERROR]: 'Network connection failed',
  [ErrorCodes.TIMEOUT]: 'Connection timed out',
}

function getCredentialValidationError(
  serverAddress: string,
  credentials: AuthCredentials,
): string | undefined {
  const validationAddress =
    serverAddress.trim() || 'https://placeholder.invalid'
  const result = ConnectionAuthSchema.safeParse({
    address: validationAddress,
    selectedServerAddress: validationAddress,
    authMethod: credentials.method,
    apiKey: credentials.method === 'apiKey' ? credentials.apiKey : '',
    username: credentials.method === 'userPass' ? credentials.username : '',
    password: credentials.method === 'userPass' ? credentials.password : '',
  })

  return result.success
    ? undefined
    : (result.error.issues[0]?.message ?? 'Invalid credentials')
}

// ─────────────────────────────────────────────────────────────────────────────
// Authentication
// ─────────────────────────────────────────────────────────────────────────────

export async function authenticate(
  serverAddress: string,
  credentials: AuthCredentials,
  options?: ApiOptions,
): Promise<AuthResult> {
  if (isAborted(options?.signal)) {
    return { success: false, error: 'Authentication cancelled' }
  }

  const validationError = getCredentialValidationError(
    serverAddress,
    credentials,
  )
  if (validationError) return { success: false, error: validationError }

  const address = serverAddress.trim()
  if (!address) return { success: false, error: 'Server address is required' }

  try {
    return credentials.method === 'apiKey'
      ? await authWithApiKey(address, credentials.apiKey.trim(), options)
      : await authWithUserPass(
          address,
          credentials.username.trim(),
          credentials.password,
          options,
        )
  } catch (error) {
    return handleAuthError(error, options)
  }
}

async function authWithApiKey(
  serverAddress: string,
  apiKey: string,
  options?: ApiOptions,
): Promise<AuthResult> {
  const api = createApi(serverAddress, apiKey)
  if (!api) return { success: false, error: 'Invalid server address' }

  const { data } = await getSystemApi(api).getSystemInfo(
    getRequestConfig(options),
  )

  return {
    success: true,
    accessToken: apiKey,
    serverVersion: data.Version ?? undefined,
  }
}

async function authWithUserPass(
  serverAddress: string,
  username: string,
  password: string,
  options?: ApiOptions,
): Promise<AuthResult> {
  const api = createApi(serverAddress)
  if (!api) return { success: false, error: 'Invalid server address' }

  const { data } = await getUserApi(api).authenticateUserByName(
    { authenticateUserByName: { Username: username, Pw: password } },
    getRequestConfig(options),
  )

  const accessToken = data.AccessToken
  if (!accessToken) return { success: false, error: 'No access token received' }

  const serverVersion = await fetchServerVersion(
    serverAddress,
    accessToken,
    options,
  )

  return {
    success: true,
    accessToken,
    userId: data.User?.Id ?? undefined,
    username: data.User?.Name ?? undefined,
    serverVersion,
  }
}

async function fetchServerVersion(
  serverAddress: string,
  accessToken: string,
  options?: ApiOptions,
): Promise<string | undefined> {
  try {
    const api = createApi(serverAddress, accessToken)
    if (!api) return undefined
    const { data } = await getSystemApi(api).getSystemInfo(
      getRequestConfig(options),
    )
    return data.Version ?? undefined
  } catch {
    return undefined
  }
}

function handleAuthError(error: unknown, options?: ApiOptions): AuthResult {
  if (isAbortError(error) || isAborted(options?.signal)) {
    return { success: false, error: 'Authentication cancelled' }
  }

  const appError = AppError.from(error, 'Authentication failed')
  return {
    success: false,
    error: AUTH_ERROR_MESSAGES[appError.code] ?? appError.message,
  }
}
