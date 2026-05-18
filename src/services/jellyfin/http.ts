import { AppError, ErrorCodes, isAbortError } from '@/lib/unified-error'
import { isValidEndpoint } from './security'

export interface JellyfinFetchOptions {
  baseUrl: string
  accessToken?: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  endpoint: string
  query?: URLSearchParams
  body?: unknown
  signal?: AbortSignal
  timeout?: number
}

interface RequestOptions extends JellyfinFetchOptions {
  expectJson: boolean
}

const trimSlashes = (value: string): string => value.replace(/^\/+|\/+$/g, '')

function buildUrl(baseUrl: string, endpoint: string, query?: URLSearchParams) {
  const base = baseUrl.replace(/\/+$/, '')
  const path = trimSlashes(endpoint)
  const qs = query?.toString()
  return `${base}/${path}${qs ? `?${qs}` : ''}`
}

function createRequestSignal(
  callerSignal: AbortSignal | undefined,
  timeout: number | undefined,
): { signal?: AbortSignal; cleanup: () => void; didTimeout: () => boolean } {
  if (!callerSignal && timeout == null) {
    return { cleanup: () => {}, didTimeout: () => false }
  }

  const controller = new AbortController()
  let timedOut = false
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const abortFromCaller = () => {
    controller.abort(
      callerSignal?.reason ?? new DOMException('Aborted', 'AbortError'),
    )
  }

  if (callerSignal?.aborted) abortFromCaller()
  else callerSignal?.addEventListener('abort', abortFromCaller, { once: true })

  if (timeout != null) {
    timeoutId = setTimeout(() => {
      timedOut = true
      controller.abort(new DOMException('Timeout', 'TimeoutError'))
    }, timeout)
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timeoutId) clearTimeout(timeoutId)
      callerSignal?.removeEventListener('abort', abortFromCaller)
    },
    didTimeout: () => timedOut,
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  if (!text) {
    throw new AppError('Expected JSON response', ErrorCodes.UNKNOWN, false)
  }

  try {
    return JSON.parse(text) as T
  } catch (error) {
    throw new AppError(
      'Failed to parse JSON response',
      ErrorCodes.UNKNOWN,
      false,
      undefined,
      error,
    )
  }
}

async function jellyfinRequest<T>(options: RequestOptions): Promise<T> {
  const { accessToken, body, expectJson, method, signal, timeout } = options

  if (!isValidEndpoint(options.endpoint)) {
    throw new AppError('Invalid endpoint', ErrorCodes.INVALID_INPUT, false)
  }

  const requestSignal = createRequestSignal(signal, timeout)

  try {
    const headers: Record<string, string> = {}
    if (accessToken)
      headers.Authorization = `MediaBrowser Token="${accessToken}"`
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    const response = await fetch(
      buildUrl(options.baseUrl, options.endpoint, options.query),
      {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers,
        method,
        signal: requestSignal.signal,
      },
    )

    if (!response.ok) throw AppError.fromStatus(response.status)
    if (!expectJson) return undefined as T

    return await readJson<T>(response)
  } catch (error) {
    if (requestSignal.didTimeout()) {
      throw new AppError(
        'Request timed out',
        ErrorCodes.TIMEOUT,
        true,
        undefined,
        error,
      )
    }
    if (isAbortError(error)) throw error
    if (error instanceof AppError) throw error
    if (error instanceof TypeError) {
      throw new AppError(
        'Network connection failed',
        ErrorCodes.NETWORK_ERROR,
        true,
        undefined,
        error,
      )
    }
    throw AppError.from(error)
  } finally {
    requestSignal.cleanup()
  }
}

export function jellyfinFetchJson<T>(
  options: JellyfinFetchOptions,
): Promise<T> {
  return jellyfinRequest<T>({ ...options, expectJson: true })
}

export function jellyfinFetchEmpty(
  options: JellyfinFetchOptions,
): Promise<void> {
  return jellyfinRequest<void>({ ...options, expectJson: false })
}
