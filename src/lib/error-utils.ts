/**
 * Error Utilities
 *
 * Shared utilities for error classification and user-friendly messaging.
 *
 * @module lib/error-utils
 */

// ─────────────────────────────────────────────────────────────────────────────
// Network Error Detection
// ─────────────────────────────────────────────────────────────────────────────

const NETWORK_ERROR_KEYWORDS = [
  'network',
  'connection',
  'timeout',
  'unreachable',
  'offline',
  'dns',
  'econnrefused',
  'enotfound',
  'etimedout',
  'fetch failed',
  'failed to fetch',
] as const

/**
 * Determines if an error message indicates a network-related issue.
 */
export function isNetworkRelatedError(error: string): boolean {
  const lowerError = error.toLowerCase()
  return NETWORK_ERROR_KEYWORDS.some((keyword) => lowerError.includes(keyword))
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Suggestions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gets a helpful suggestion based on the error message.
 * Provides contextual guidance for common error scenarios.
 */
export function getErrorSuggestion(error: string): string {
  const lowerError = error.toLowerCase()

  if (isNetworkRelatedError(error)) {
    return 'Check your network connection and ensure the server is running.'
  }
  if (lowerError.includes('invalid credentials')) {
    return 'Double-check your credentials and try again.'
  }
  if (
    lowerError.includes('access denied') ||
    lowerError.includes('forbidden')
  ) {
    return 'Your account may not have permission. Contact your server administrator.'
  }
  if (lowerError.includes('api key')) {
    return 'Verify your API key in Jellyfin Dashboard → API Keys.'
  }
  if (lowerError.includes('timeout')) {
    return 'The server took too long to respond. Try again or check if the server is busy.'
  }
  return 'Please verify your input and try again.'
}
