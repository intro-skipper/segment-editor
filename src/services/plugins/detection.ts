/**
 * Plugin detection service.
 * Checks availability of EDL and Chapter plugins on the Jellyfin server.
 */

import { PluginStatus } from '@jellyfin/sdk/lib/generated-client'
import type { PluginInfo } from '@jellyfin/sdk/lib/generated-client'
import type { ApiOptions } from '@/lib/api-utils'
import { getTypedApis } from '@/services/jellyfin/sdk'
import { AppError, ErrorCodes, isAbortError } from '@/lib/unified-error'
import { PluginInfoArraySchema } from '@/lib/schemas'
import { logValidationWarning } from '@/lib/validation-logger'
import { getRequestConfig, logApiError } from '@/lib/api-utils'

export type PluginDetectionOptions = ApiOptions

export interface PluginAvailability {
  installed: boolean
  version: string
}

export type PluginCheckErrorType = 'network' | 'auth' | 'parse' | 'unknown'

export interface PluginCheckError {
  type: PluginCheckErrorType
  message: string
}

export interface PluginTestResult {
  edl: PluginAvailability
  chapter: PluginAvailability
  introSkipper: PluginAvailability
  segmentsApi: PluginAvailability
  error?: PluginCheckError
}

const PLUGIN_NAMES = {
  EDL: 'EDL Creator',
  CHAPTER: 'Chapter Creator',
  INTRO_SKIPPER: 'Intro Skipper',
  SEGMENTS_API: 'MediaSegments API',
} as const

const DEFAULT_AVAILABILITY: PluginAvailability = {
  installed: false,
  version: '0.0.0',
}

const createDefaultResult = (error?: PluginCheckError): PluginTestResult => ({
  edl: { ...DEFAULT_AVAILABILITY },
  chapter: { ...DEFAULT_AVAILABILITY },
  introSkipper: { ...DEFAULT_AVAILABILITY },
  segmentsApi: { ...DEFAULT_AVAILABILITY },
  error,
})

const checkPluginStatus = (
  plugins: Array<PluginInfo>,
  name: string,
): PluginAvailability => {
  const plugin = plugins.find((p) => p.Name === name)
  const isActive = plugin?.Status === PluginStatus.Active
  return {
    installed: isActive,
    version: isActive ? (plugin.Version ?? '0.0.0') : '0.0.0',
  }
}

const ERROR_TYPE_MAP: Record<string, PluginCheckErrorType> = {
  [ErrorCodes.NETWORK_ERROR]: 'network',
  [ErrorCodes.TIMEOUT]: 'network',
  [ErrorCodes.UNAUTHORIZED]: 'auth',
  [ErrorCodes.FORBIDDEN]: 'auth',
  [ErrorCodes.VALIDATION_ERROR]: 'parse',
}

const categorizeError = (error: unknown): PluginCheckError => {
  const appError = AppError.from(error)
  const type = ERROR_TYPE_MAP[appError.code] ?? 'unknown'
  const messages: Record<PluginCheckErrorType, string> = {
    network: 'Network error: Unable to connect to server',
    auth: 'Authentication failed: Please check your credentials',
    parse: 'Invalid response from server',
    unknown: appError.message,
  }
  return { type, message: messages[type] }
}

export async function testServerPlugins(
  options?: PluginDetectionOptions,
): Promise<PluginTestResult> {
  if (options?.signal?.aborted) {
    return createDefaultResult({
      type: 'unknown',
      message: 'Request cancelled',
    })
  }

  const apis = getTypedApis()
  if (!apis) {
    return createDefaultResult({
      type: 'auth',
      message: 'API not available: Please configure server connection',
    })
  }

  try {
    const { data: plugins } = await apis.pluginsApi.getPlugins(
      getRequestConfig(options),
    )

    const validation = PluginInfoArraySchema.safeParse(plugins)
    if (!validation.success)
      logValidationWarning('[Plugin Detection]', validation.error)

    return {
      edl: checkPluginStatus(plugins, PLUGIN_NAMES.EDL),
      chapter: checkPluginStatus(plugins, PLUGIN_NAMES.CHAPTER),
      introSkipper: checkPluginStatus(plugins, PLUGIN_NAMES.INTRO_SKIPPER),
      segmentsApi: checkPluginStatus(plugins, PLUGIN_NAMES.SEGMENTS_API),
    }
  } catch (error) {
    if (isAbortError(error)) {
      return createDefaultResult({
        type: 'unknown',
        message: 'Request cancelled',
      })
    }
    const categorized = categorizeError(error)
    logApiError(AppError.from(error), `Plugin Detection (${categorized.type})`)
    return createDefaultResult(categorized)
  }
}

export const isEdlAvailable = (
  result: PluginTestResult,
  enabled: boolean,
): boolean => result.edl.installed && enabled

export const isChapterAvailable = (
  result: PluginTestResult,
  enabled: boolean,
): boolean => result.chapter.installed && enabled
