/**
 * Shared plugin API utilities.
 * Provides common patterns for plugin service API calls.
 *
 * Security: All URL parameters are properly encoded to prevent injection attacks.
 */

import type { ApiOptions } from '@/services/jellyfin/sdk'
import {
  getRequestConfig,
  getServerBaseUrl,
  withApi,
} from '@/services/jellyfin/sdk'
import { AppError, logApiError } from '@/lib/unified-error'
import {
  UrlSafeStringSchema,
  encodeUrlParam,
  isValidItemId,
} from '@/lib/schemas'

/** Common API options for plugin operations */
export type PluginApiOptions = ApiOptions

/** Result of ID validation */
export interface IdValidationResult {
  valid: boolean
  error?: string
}

/**
 * Validates a single item ID for plugin operations.
 * Security: Ensures ID format is valid before API calls.
 */
export function validatePluginItemId(
  itemId: string,
  context: string,
): IdValidationResult {
  if (!isValidItemId(itemId)) {
    console.error(`Invalid item ID format for ${context}`)
    return { valid: false, error: 'Invalid item ID format' }
  }
  return { valid: true }
}

/**
 * Validates multiple item IDs for plugin operations.
 * Security: Ensures all ID formats are valid before API calls.
 */
export function validatePluginItemIds(
  itemIds: Array<string>,
  context: string,
): IdValidationResult {
  const invalidIds = itemIds.filter((id) => !isValidItemId(id))
  if (invalidIds.length > 0) {
    console.error(`Invalid item ID format(s) for ${context}`)
    return { valid: false, error: 'Invalid item ID format' }
  }
  return { valid: true }
}

/**
 * Builds a plugin endpoint URL with proper encoding.
 * Security: Ensures URL parameters are properly encoded.
 */
export function buildPluginEndpoint(basePath: string, itemId: string): string {
  return `${basePath}/${encodeUrlParam(itemId)}`
}

/** Result of plugin create operations */
export interface PluginCreateResult {
  success: boolean
  error?: string
}

/** Shared request execution with error handling */
async function executeRequest<T>(
  method: 'get' | 'post',
  endpoint: string,
  options?: PluginApiOptions,
  data?: unknown,
): Promise<{ data?: T; error?: string }> {
  // Security: Validate endpoint doesn't contain dangerous patterns
  const endpointValidation = UrlSafeStringSchema.safeParse(endpoint)
  if (!endpointValidation.success) {
    return { error: 'Invalid endpoint format' }
  }

  try {
    const result = await withApi(async (apis) => {
      // The SDK's axios instance already has auth headers configured
      const config = {
        ...(method === 'post' && {
          headers: { 'Content-Type': 'application/json' },
        }),
        ...getRequestConfig(options),
      }

      const url = `${getServerBaseUrl()}${endpoint}`
      const response =
        method === 'get'
          ? await apis.api.axiosInstance.get<T>(url, config)
          : await apis.api.axiosInstance.post<T>(url, data, config)
      return response.data
    }, options)

    if (result === null) {
      if (options?.signal?.aborted) return { error: 'Request cancelled' }
      return { error: 'API not available' }
    }

    return { data: result }
  } catch (error) {
    const appError = AppError.from(
      error,
      `Failed to ${method.toUpperCase()} ${endpoint}`,
    )
    logApiError(appError, 'Plugin API')
    return { error: appError.message }
  }
}

/** Makes a GET request to a plugin endpoint. Returns null on failure. */
export async function pluginGet<T>(
  endpoint: string,
  options?: PluginApiOptions,
): Promise<T | null> {
  const result = await executeRequest<T>('get', endpoint, options)
  return result.data ?? null
}

/** Makes a POST request to a plugin endpoint. Returns success/error result. */
export async function pluginPost<T = unknown>(
  endpoint: string,
  data: T,
  options?: PluginApiOptions,
): Promise<PluginCreateResult> {
  const result = await executeRequest('post', endpoint, options, data)
  return result.error
    ? { success: false, error: result.error }
    : { success: true }
}
