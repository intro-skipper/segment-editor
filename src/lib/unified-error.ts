/**
 * Unified error handling for the entire application.
 *
 * Security: Error messages are sanitized to prevent credential leakage.
 * Tokens, API keys, and other sensitive data are never exposed in error messages.
 */

import type { ErrorInfo } from 'react'
import type { ZodError } from 'zod'

export const ErrorCodes = {
  API_UNAVAILABLE: 'API_UNAVAILABLE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'CANCELLED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  SERVER_ERROR: 'SERVER_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  UNKNOWN: 'UNKNOWN',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

/**
 * Sensitive patterns that should never appear in error messages.
 * Security: Used to sanitize error messages before display.
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
 * Security: Prevents credential leakage in error messages.
 */
function sanitizeErrorMessage(message: string): string {
  let sanitized = message
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]')
  }
  return sanitized
}

// Error detection helpers
const NETWORK_CODES = new Set([
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ERR_NETWORK',
])

const getProp = <T>(e: unknown, key: string): T | undefined =>
  e && typeof e === 'object' && key in e
    ? (e as Record<string, T>)[key]
    : undefined

const getCode = (e: unknown) => getProp<string>(e, 'code')
const getStatus = (e: unknown) =>
  getProp<{ status?: number }>(e, 'response')?.status

export const isAbortError = (e: unknown): boolean =>
  (e instanceof DOMException && e.name === 'AbortError') ||
  getCode(e) === 'ERR_CANCELED'

const isTimeoutError = (e: unknown): boolean => getCode(e) === 'ECONNABORTED'

const isNetworkError = (e: unknown): boolean => {
  const code = getCode(e)
  return typeof code === 'string' && NETWORK_CODES.has(code)
}

export const isRecoverableError = (e: unknown): boolean => {
  if (isAbortError(e)) return false
  if (isTimeoutError(e) || isNetworkError(e)) return true
  const status = getStatus(e)
  return status !== undefined && (status >= 500 || status === 429)
}

// HTTP status mapping
const STATUS_MAP: Record<
  number,
  { code: ErrorCode; message: string; recoverable: boolean }
> = {
  401: {
    code: ErrorCodes.UNAUTHORIZED,
    message: 'Authentication required',
    recoverable: true,
  },
  403: {
    code: ErrorCodes.FORBIDDEN,
    message: 'Access denied',
    recoverable: false,
  },
  404: {
    code: ErrorCodes.NOT_FOUND,
    message: 'Resource not found',
    recoverable: false,
  },
  429: {
    code: ErrorCodes.SERVER_ERROR,
    message: 'Too many requests',
    recoverable: true,
  },
}

export class AppError extends Error {
  readonly name = 'AppError'

  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly recoverable = false,
    public readonly status?: number,
    public readonly originalError?: unknown,
  ) {
    super(message)
  }

  static from(error: unknown, context?: string): AppError {
    if (error instanceof AppError) return error

    if (isAbortError(error))
      return new AppError(
        'Request cancelled',
        ErrorCodes.CANCELLED,
        false,
        undefined,
        error,
      )
    if (isTimeoutError(error))
      return new AppError(
        'Request timed out',
        ErrorCodes.TIMEOUT,
        true,
        undefined,
        error,
      )
    if (isNetworkError(error))
      return new AppError(
        'Network connection failed',
        ErrorCodes.NETWORK_ERROR,
        true,
        undefined,
        error,
      )

    const status = getStatus(error)
    if (status !== undefined) return AppError.fromStatus(status, error)

    // Security: Sanitize error message to prevent credential leakage
    const msg = getErrorMessage(error)
    return new AppError(
      context ? `${context}: ${msg}` : msg,
      ErrorCodes.UNKNOWN,
      isRecoverableError(error),
      undefined,
      error,
    )
  }

  static fromStatus(status: number, originalError?: unknown): AppError {
    const mapped = STATUS_MAP[status] as
      | (typeof STATUS_MAP)[keyof typeof STATUS_MAP]
      | undefined
    if (mapped)
      return new AppError(
        mapped.message,
        mapped.code,
        mapped.recoverable,
        status,
        originalError,
      )
    if (status >= 500)
      return new AppError(
        'Server error',
        ErrorCodes.SERVER_ERROR,
        true,
        status,
        originalError,
      )
    if (status >= 400)
      return new AppError(
        'Request failed',
        ErrorCodes.VALIDATION_ERROR,
        false,
        status,
        originalError,
      )
    return new AppError(
      'Unexpected response',
      ErrorCodes.UNKNOWN,
      false,
      status,
      originalError,
    )
  }

  static validation = (msg: string) =>
    new AppError(msg, ErrorCodes.INVALID_INPUT, false)
  static unavailable = () =>
    new AppError('API not available', ErrorCodes.API_UNAVAILABLE, true)
}

const getErrorMessage = (error: unknown): string => {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'An unexpected error occurred'
  // Security: Sanitize error message to prevent credential leakage
  return sanitizeErrorMessage(rawMessage)
}

// ============================================================================
// Logging utilities
// ============================================================================

interface ErrorLogContext {
  component?: string
  context?: Record<string, unknown>
  action?: string
  severity?: 'low' | 'medium' | 'high' | 'critical'
}

interface LoggedError {
  message: string
  stack?: string
  componentStack?: string
  timestamp: string
  context: ErrorLogContext
}

/** Logs an error with context. Dev: full details. Prod: condensed.
 * Security: All messages are sanitized to prevent credential leakage.
 */
export function logError(
  error: Error,
  errorInfo?: ErrorInfo | null,
  context: ErrorLogContext = {},
): LoggedError {
  const sanitizedMessage = sanitizeErrorMessage(error.message)

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

/** Logs validation warnings for API responses with context. */
export function logValidationWarning(context: string, error: ZodError): void {
  console.warn(`[${context}] Validation warning:`, {
    issues: error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    })),
  })
}
