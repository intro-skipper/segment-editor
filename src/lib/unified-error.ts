/**
 * Unified error handling for the entire application.
 *
 * Security: Error messages are sanitized to prevent credential leakage.
 * Tokens, API keys, and other sensitive data are never exposed in error messages.
 */

import { z } from 'zod'

import { lookup } from './utils'

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

/**
 * The diagnostic fields HTTP clients and the platform attach to thrown values.
 * Every field falls back to undefined so one off-type field cannot discard the
 * others. Decoding is not free, so the entry points below decode once and
 * thread the result through every predicate.
 */
const ThrownErrorSchema = z.object({
  code: z.string().optional().catch(undefined),
  status: z.number().optional().catch(undefined),
  response: z
    .object({ status: z.number().optional().catch(undefined) })
    .optional()
    .catch(undefined),
})

type ThrownError = z.infer<typeof ThrownErrorSchema>

/** A caught value carrying none of the fields we know how to read. */
const OPAQUE_THROWN: ThrownError = {}

/** Decodes a caught value into the error fields this module understands. */
const parseThrown = (cause: unknown): ThrownError => {
  const parsed = ThrownErrorSchema.safeParse(cause)
  return parsed.success ? parsed.data : OPAQUE_THROWN
}

/** Axios reports the status on a nested response; fetch wrappers hoist it. */
const getStatus = (thrown: ThrownError): number | undefined =>
  thrown.response?.status ?? thrown.status

const isAborted = (cause: unknown, thrown: ThrownError): boolean =>
  (cause instanceof DOMException && cause.name === 'AbortError') ||
  thrown.code === 'ERR_CANCELED'

const isTimeout = (thrown: ThrownError): boolean =>
  thrown.code === 'ECONNABORTED'

const isNetwork = (thrown: ThrownError): boolean =>
  thrown.code !== undefined && NETWORK_CODES.has(thrown.code)

const isRecoverable = (cause: unknown, thrown: ThrownError): boolean => {
  if (isAborted(cause, thrown)) return false

  const status = getStatus(thrown)
  if (status !== undefined) return status >= 500 || status === 429

  if (
    thrown.code === ErrorCodes.TIMEOUT ||
    thrown.code === ErrorCodes.NETWORK_ERROR
  ) {
    return true
  }

  if (isTimeout(thrown) || isNetwork(thrown)) return true

  return cause instanceof AppError && cause.recoverable
}

export const isAbortError = (cause: unknown): boolean =>
  isAborted(cause, parseThrown(cause))

export const isRecoverableError = (cause: unknown): boolean =>
  isRecoverable(cause, parseThrown(cause))

// HTTP status mapping
const STATUS_MAP = {
  401: {
    code: ErrorCodes.UNAUTHORIZED,
    message: 'Authentication required',
    recoverable: false,
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
} satisfies Record<
  number,
  { code: ErrorCode; message: string; recoverable: boolean }
>

export class AppError extends Error {
  readonly name = 'AppError'

  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly recoverable = false,
    public readonly status?: number,
    cause?: unknown,
  ) {
    super(message, { cause })
  }

  static from(cause: unknown, context?: string): AppError {
    if (cause instanceof AppError) return cause

    // Decoded once here and threaded through every check below; `from` runs on
    // every retry decision, so a parse per predicate is not affordable.
    const thrown = parseThrown(cause)

    if (isAborted(cause, thrown))
      return new AppError(
        'Request cancelled',
        ErrorCodes.CANCELLED,
        false,
        undefined,
        cause,
      )
    if (isTimeout(thrown))
      return new AppError(
        'Request timed out',
        ErrorCodes.TIMEOUT,
        true,
        undefined,
        cause,
      )
    if (isNetwork(thrown))
      return new AppError(
        'Network connection failed',
        ErrorCodes.NETWORK_ERROR,
        true,
        undefined,
        cause,
      )

    const status = getStatus(thrown)
    if (status !== undefined) return AppError.fromStatus(status, cause)

    // Security: Sanitize error message to prevent credential leakage
    const msg = getErrorMessage(cause)
    return new AppError(
      context ? `${context}: ${msg}` : msg,
      ErrorCodes.UNKNOWN,
      isRecoverable(cause, thrown),
      undefined,
      cause,
    )
  }

  static fromStatus(status: number, cause?: unknown): AppError {
    const mapped = lookup(STATUS_MAP, status)
    if (mapped)
      return new AppError(
        mapped.message,
        mapped.code,
        mapped.recoverable,
        status,
        cause,
      )
    if (status >= 500)
      return new AppError(
        'Server error',
        ErrorCodes.SERVER_ERROR,
        true,
        status,
        cause,
      )
    if (status >= 400)
      return new AppError(
        'Request failed',
        ErrorCodes.VALIDATION_ERROR,
        false,
        status,
        cause,
      )
    return new AppError(
      'Unexpected response',
      ErrorCodes.UNKNOWN,
      false,
      status,
      cause,
    )
  }

  static validation = (msg: string) =>
    new AppError(msg, ErrorCodes.INVALID_INPUT, false)
  static unavailable = () =>
    new AppError('API not available', ErrorCodes.API_UNAVAILABLE, true)
}

const getErrorMessage = (cause: unknown): string => {
  const rawMessage =
    cause instanceof Error
      ? cause.message
      : typeof cause === 'string'
        ? cause
        : 'An unexpected error occurred'
  // Security: Sanitize error message to prevent credential leakage
  return sanitizeErrorMessage(rawMessage)
}

// ============================================================================
// Logging utilities
// ============================================================================

interface ErrorLogContext {
  component?: string
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
