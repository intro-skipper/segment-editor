/**
 * Shared API utilities for consistent request handling.
 * Reduces duplication across service files.
 */

import { AppError, isAbortError } from './unified-error'
import { API_CONFIG } from './constants'
import type { RetryOptions } from './retry-utils'
import { getTypedApis } from '@/services/jellyfin/sdk'


/** Common options for API operations */
export interface ApiOptions {
  signal?: AbortSignal
  timeout?: number
}

/** Standard request configuration */
export interface RequestConfig {
  signal?: AbortSignal
  timeout: number
}

/** Checks if request was aborted, returns true if should exit early */
export const isAborted = (signal?: AbortSignal): boolean =>
  signal?.aborted === true

/** Gets standard retry options from API options */
export const getRetryOptions = (options?: ApiOptions): RetryOptions => ({
  maxRetries: API_CONFIG.MAX_RETRIES,
  baseDelay: API_CONFIG.BASE_RETRY_DELAY_MS,
  maxDelay: API_CONFIG.MAX_RETRY_DELAY_MS,
  signal: options?.signal,
})

/** Gets standard request config from API options */
export const getRequestConfig = (
  options?: ApiOptions,
  defaultTimeout: number = API_CONFIG.DEFAULT_TIMEOUT_MS,
): RequestConfig => ({
  signal: options?.signal,
  timeout: options?.timeout ?? defaultTimeout,
})

/** Logs API errors consistently */
export const logApiError = (error: AppError, context?: string): void => {
  console.error(`[API]${context ? ` ${context}:` : ''} ${error.message}`, {
    code: error.code,
    recoverable: error.recoverable,
  })
}

/**
 * Wraps an async API call with consistent error handling.
 * Returns null on abort or API unavailability.
 */
export async function safeApiCall<T>(
  fn: () => Promise<T>,
  context: string,
  options?: ApiOptions,
): Promise<T | null> {
  if (isAborted(options?.signal)) return null

  const apis = getTypedApis()
  if (!apis) {
    console.error('API not available')
    return null
  }

  try {
    return await fn()
  } catch (error) {
    if (isAbortError(error)) return null
    const appError = AppError.from(error, context)
    logApiError(appError)
    return null
  }
}

/**
 * Wraps an async API call that throws on failure.
 * Use when you need to propagate errors.
 */
export async function apiCall<T>(
  fn: () => Promise<T>,
  context: string,
): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    throw AppError.from(e, context)
  }
}

/**
 * Validates required parameters, throws AppError if missing.
 */
export function requireParam(value: unknown, name: string): asserts value {
  if (!value) throw AppError.validation(`${name} is required`)
}

/**
 * Validates multiple required parameters.
 */
export function requireParams(
  params: Record<string, unknown>,
): asserts params is Record<string, NonNullable<unknown>> {
  const missing = Object.entries(params)
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (missing.length > 0) {
    throw AppError.validation(
      `${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} required`,
    )
  }
}
