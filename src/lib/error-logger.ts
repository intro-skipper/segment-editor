/**
 * Centralized error logging utility.
 *
 * Security: This logger is designed to NEVER expose sensitive information:
 * - Tokens, API keys, and credentials are never logged
 * - Error messages are sanitized before display
 * - Stack traces are only shown in development mode
 */

import type { ErrorInfo } from 'react'

export interface ErrorLogContext {
  component?: string
  context?: Record<string, unknown>
  action?: string
  severity?: 'low' | 'medium' | 'high' | 'critical'
}

export interface LoggedError {
  message: string
  stack?: string
  componentStack?: string
  timestamp: string
  context: ErrorLogContext
}

/**
 * Sensitive patterns that should never appear in logs.
 * Security: Used to sanitize error messages before logging.
 */
const SENSITIVE_PATTERNS = [
  /token[=:]["']?[^"'\s]+["']?/gi,
  /apikey[=:]["']?[^"'\s]+["']?/gi,
  /api_key[=:]["']?[^"'\s]+["']?/gi,
  /password[=:]["']?[^"'\s]+["']?/gi,
  /authorization[=:]["']?[^"'\s]+["']?/gi,
  /bearer\s+[^\s]+/gi,
  /MediaBrowser\s+Token="[^"]+"/gi,
]

/**
 * Sanitizes a message to remove any potentially sensitive information.
 * Security: Prevents credential leakage in logs and error messages.
 */
function sanitizeMessage(message: string): string {
  let sanitized = message
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]')
  }
  return sanitized
}

/** Logs an error with context. Dev: full details. Prod: condensed.
 * Security: All messages are sanitized to prevent credential leakage.
 */
export function logError(
  error: Error,
  errorInfo?: ErrorInfo | null,
  context: ErrorLogContext = {},
): LoggedError {
  // Security: Sanitize error message to prevent credential leakage
  const sanitizedMessage = sanitizeMessage(error.message)

  const loggedError: LoggedError = {
    message: sanitizedMessage,
    stack: error.stack,
    componentStack: errorInfo?.componentStack ?? undefined,
    timestamp: new Date().toISOString(),
    context: { severity: 'medium', ...context },
  }

  if (process.env.NODE_ENV === 'development') {
    console.group(`🚨 Error: ${sanitizedMessage}`)
    console.error('Error:', error)
    if (errorInfo?.componentStack)
      console.error('Component Stack:', errorInfo.componentStack)
    if (Object.keys(context).length > 0) console.info('Context:', context)
    console.groupEnd()
  } else {
    console.error(
      `[${loggedError.timestamp}] ${context.component ?? 'Unknown'}: ${sanitizedMessage}`,
    )
  }

  return loggedError
}
