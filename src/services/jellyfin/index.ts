/**
 * Jellyfin service - unified API access layer.
 *
 * Architecture:
 * - types.ts: Type definitions (no runtime code)
 * - security.ts: URL sanitization and validation
 * - core.ts: SDK client and API factory
 * - auth.ts: Authentication flows
 * - discovery.ts: Server discovery
 * - connection.ts: Connection testing and credential management
 *
 * @module services/jellyfin
 */

import { clearApiCache, setCredentialResolver } from './core'
import { getCredentials } from './connection'
import { useApiStore } from '@/stores/api-store'

// ─────────────────────────────────────────────────────────────────────────────
// Initialization (runs once on module load)
// ─────────────────────────────────────────────────────────────────────────────

// Register credential resolver with core module
setCredentialResolver(getCredentials)

// Auto-clear API cache when credentials change
useApiStore.subscribe((state, prev) => {
  if (
    state.serverAddress !== prev.serverAddress ||
    state.apiKey !== prev.apiKey
  ) {
    clearApiCache()
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Public API - Types
// ─────────────────────────────────────────────────────────────────────────────

export type {
  TypedApis,
  ApiOptions,
  Credentials,
  AuthCredentials,
  ApiKeyCredentials,
  UserPassCredentials,
  AuthResult,
  ConnectionResult,
} from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Public API - Core
// ─────────────────────────────────────────────────────────────────────────────

export {
  withApi,
  getTypedApis,
  createApi,
  getRequestConfig,
  clearApiCache,
  isAborted,
  isPluginMode,
  getPluginCredentials,
  getDeviceId,
  getJellyfinClient,
  resetClient,
} from './core'

// ─────────────────────────────────────────────────────────────────────────────
// Public API - Connection
// ─────────────────────────────────────────────────────────────────────────────

export {
  testConnection,
  testConnectionWithCredentials,
  storeAuthResult,
  getCredentials,
  getServerBaseUrl,
  getAccessToken,
} from './connection'

// ─────────────────────────────────────────────────────────────────────────────
// Public API - Security
// ─────────────────────────────────────────────────────────────────────────────

export {
  sanitizeUrl,
  sanitizeQueryParam,
  sanitizeEndpoint,
  isValidEndpoint,
  buildApiUrl,
} from './security'

// ─────────────────────────────────────────────────────────────────────────────
// Public API - Discovery
// ─────────────────────────────────────────────────────────────────────────────

export {
  discoverServers,
  findBestServer,
  sortServersByScore,
  getScoreDisplay,
  RecommendedServerInfoScore,
} from './discovery'

export type {
  DiscoveryResult,
  ScoreDisplay,
  RecommendedServerInfo,
} from './discovery'

// ─────────────────────────────────────────────────────────────────────────────
// Public API - Authentication
// ─────────────────────────────────────────────────────────────────────────────

export { authenticate, validateCredentials, isValidPassword } from './auth'
