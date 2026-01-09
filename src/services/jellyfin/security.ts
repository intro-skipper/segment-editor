/**
 * URL sanitization and security utilities.
 * Single Responsibility: Validate and sanitize URLs to prevent injection attacks.
 * @module services/jellyfin/security
 */

// ─────────────────────────────────────────────────────────────────────────────
// Security Patterns (compiled once at module load)
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])
const DANGEROUS_PROTOCOLS = [
  /^javascript:/i,
  /^data:/i,
  /^vbscript:/i,
  /^file:/i,
]
const PATH_TRAVERSAL = /(?:^|[\\/])\.\.(?:[\\/]|$)/
const ENCODED_TRAVERSAL = /%2e%2e|%252e%252e|%c0%ae|%c1%9c/i
// eslint-disable-next-line no-control-regex
const DANGEROUS_CHARS = /[\x00-\x1f\x7f]/

// ─────────────────────────────────────────────────────────────────────────────
// URL Sanitization
// ─────────────────────────────────────────────────────────────────────────────

/** Sanitizes a URL, returning null if invalid or dangerous. */
export function sanitizeUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim()
  if (!trimmed || DANGEROUS_CHARS.test(trimmed)) return null

  let decoded: string
  try {
    decoded = decodeURIComponent(trimmed)
  } catch {
    decoded = trimmed
  }

  const lower = trimmed.toLowerCase()
  const lowerDecoded = decoded.toLowerCase()
  if (DANGEROUS_PROTOCOLS.some((p) => p.test(lower) || p.test(lowerDecoded))) {
    return null
  }

  try {
    const parsed = new URL(trimmed)
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null

    const { pathname, hostname } = parsed
    const decodedPath = decodeURIComponent(pathname)

    if (
      PATH_TRAVERSAL.test(pathname) ||
      PATH_TRAVERSAL.test(decodedPath) ||
      ENCODED_TRAVERSAL.test(pathname) ||
      !hostname ||
      hostname.includes('..')
    ) {
      return null
    }

    const cleanPath = pathname.replace(/\/+$/, '').replace(/\/+/g, '/')
    return `${parsed.origin}${cleanPath}`
  } catch {
    return null
  }
}

/** Sanitizes a query parameter value. */
export function sanitizeQueryParam(value: string | null | undefined): string {
  if (value == null) return ''
  const str = String(value)
  if (DANGEROUS_CHARS.test(str)) return ''

  return str
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
}

/** Validates an endpoint path for traversal attacks. */
export function isValidEndpoint(endpoint: string): boolean {
  return !PATH_TRAVERSAL.test(endpoint) && !ENCODED_TRAVERSAL.test(endpoint)
}

/** Sanitizes an endpoint path. */
export function sanitizeEndpoint(endpoint: string): string {
  return endpoint.replace(/^\/+|\.{2,}/g, '')
}

// ─────────────────────────────────────────────────────────────────────────────
// URL Building
// ─────────────────────────────────────────────────────────────────────────────

export interface UrlBuildOptions {
  serverAddress: string
  accessToken?: string
  endpoint: string
  query?: URLSearchParams
  includeAuth?: boolean
}

/** Builds a full URL for a Jellyfin API endpoint. */
export function buildApiUrl(options: UrlBuildOptions): string {
  const {
    serverAddress,
    accessToken,
    endpoint,
    query,
    includeAuth = true,
  } = options
  const base = sanitizeUrl(serverAddress)
  if (!base || !isValidEndpoint(endpoint)) return ''

  const params = new URLSearchParams()

  if (query) {
    for (const [key, value] of query.entries()) {
      const sanitized = sanitizeQueryParam(value)
      if (sanitized) params.set(key, sanitized)
    }
  }

  if (includeAuth && accessToken) {
    params.set('ApiKey', accessToken)
  }

  const safeEndpoint = sanitizeEndpoint(endpoint)
  const queryString = params.toString()
  return `${base}/${safeEndpoint}${queryString ? `?${queryString}` : ''}`
}
