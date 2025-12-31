/**
 * Jellyfin API service exports.
 */
export {
  buildUrl,
  testConnection,
  fetchWithAuth,
  postJson,
  deleteJson,
  JellyfinClient,
  jellyfinClient,
} from './client'

export type { ConnectionResult, ApiError } from './client'
