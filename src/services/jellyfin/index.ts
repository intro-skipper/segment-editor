/**
 * Jellyfin service exports.
 *
 * Primary API access:
 * - withApi() - Execute API calls with automatic null/abort handling
 *
 * Utilities:
 * - buildUrl() - Construct authenticated URLs
 * - getRequestConfig() - Standard request config from options
 * - testConnection() - Validate server connection
 */

// Core SDK exports
export {
  // Primary API wrapper
  withApi,
  getRequestConfig,
  clearApiCache,
  // Credential helpers
  getServerBaseUrl,
  getAccessToken,
  getOrCreateDeviceId,
  isPluginMode,
  // URL utilities
  buildUrl,
  sanitizeUrl,
  sanitizeQueryParam,
} from './sdk'

export type { TypedApis, ApiOptions } from './sdk'

// Connection testing
export { testConnection } from './client'

export type { ConnectionResult } from './client'
