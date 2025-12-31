/**
 * Plugin detection service.
 * Checks availability of EDL and Chapter plugins on the Jellyfin server.
 */

import { PluginStatus } from '@jellyfin/sdk/lib/generated-client'
import type { PluginInfo } from '@jellyfin/sdk/lib/generated-client'
import { fetchWithAuth } from '@/services/jellyfin/client'

/**
 * Plugin availability status.
 */
export interface PluginAvailability {
  /** Whether the plugin is installed and active */
  installed: boolean
  /** Plugin version string */
  version: string
}

/**
 * Result of testing server plugins.
 */
export interface PluginTestResult {
  /** EDL Creator plugin status */
  edl: PluginAvailability
  /** Chapter Creator plugin status */
  chapter: PluginAvailability
  /** Intro Skipper plugin status */
  introSkipper: PluginAvailability
  /** MediaSegments API plugin status */
  segmentsApi: PluginAvailability
  /** Error information if plugin check failed */
  error?: PluginCheckError
}

/**
 * Error types for plugin detection.
 */
export type PluginCheckErrorType = 'network' | 'auth' | 'parse' | 'unknown'

/**
 * Error information for plugin check failures.
 */
export interface PluginCheckError {
  type: PluginCheckErrorType
  message: string
}

/** Plugin names as they appear in Jellyfin */
const PLUGIN_NAMES = {
  EDL: 'EDL Creator',
  CHAPTER: 'Chapter Creator',
  INTRO_SKIPPER: 'Intro Skipper',
  SEGMENTS_API: 'MediaSegments API',
} as const

/**
 * Default plugin availability (not installed).
 */
const DEFAULT_AVAILABILITY: PluginAvailability = {
  installed: false,
  version: '0.0.0',
}

/**
 * Checks if a plugin is installed and active.
 * @param plugins - List of plugins from the server
 * @param pluginName - Name of the plugin to check
 * @returns Plugin availability status
 */
function checkPluginStatus(
  plugins: Array<PluginInfo>,
  pluginName: string,
): PluginAvailability {
  const plugin = plugins.find((p) => p.Name === pluginName)
  const isActive = plugin?.Status === PluginStatus.Active

  return {
    installed: isActive,
    version: isActive ? (plugin.Version ?? '0.0.0') : '0.0.0',
  }
}

/**
 * Categorizes an error into a specific type.
 * @param error - The error to categorize
 * @returns Error type and message
 */
function categorizeError(error: unknown): PluginCheckError {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      type: 'network',
      message: 'Network error: Unable to connect to server',
    }
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()

    if (message.includes('401') || message.includes('unauthorized')) {
      return {
        type: 'auth',
        message: 'Authentication failed: Please check your credentials',
      }
    }

    if (message.includes('json') || message.includes('parse')) {
      return {
        type: 'parse',
        message: 'Invalid response from server',
      }
    }

    return {
      type: 'unknown',
      message: error.message,
    }
  }

  return {
    type: 'unknown',
    message: 'An unexpected error occurred',
  }
}

/**
 * Tests the availability of plugins on the Jellyfin server.
 * Checks for EDL Creator, Chapter Creator, Intro Skipper, and MediaSegments API plugins.
 * @returns Plugin test result with availability status for each plugin
 */
export async function testServerPlugins(): Promise<PluginTestResult> {
  try {
    const plugins = await fetchWithAuth<Array<PluginInfo>>('Plugins')

    return {
      edl: checkPluginStatus(plugins, PLUGIN_NAMES.EDL),
      chapter: checkPluginStatus(plugins, PLUGIN_NAMES.CHAPTER),
      introSkipper: checkPluginStatus(plugins, PLUGIN_NAMES.INTRO_SKIPPER),
      segmentsApi: checkPluginStatus(plugins, PLUGIN_NAMES.SEGMENTS_API),
    }
  } catch (error) {
    const categorizedError = categorizeError(error)
    console.error(
      `Failed to test server plugins (${categorizedError.type}):`,
      categorizedError.message,
    )

    // Return default (not installed) status for all plugins on error
    return {
      edl: { ...DEFAULT_AVAILABILITY },
      chapter: { ...DEFAULT_AVAILABILITY },
      introSkipper: { ...DEFAULT_AVAILABILITY },
      segmentsApi: { ...DEFAULT_AVAILABILITY },
      error: categorizedError,
    }
  }
}

/**
 * Checks if the EDL plugin is available and enabled.
 * @param pluginResult - Result from testServerPlugins
 * @param enableEdl - Whether EDL is enabled in app settings
 * @returns True if EDL plugin is installed and enabled
 */
export function isEdlAvailable(
  pluginResult: PluginTestResult,
  enableEdl: boolean,
): boolean {
  return pluginResult.edl.installed && enableEdl
}

/**
 * Checks if the Chapter plugin is available and enabled.
 * @param pluginResult - Result from testServerPlugins
 * @param enableChapter - Whether Chapter is enabled in app settings
 * @returns True if Chapter plugin is installed and enabled
 */
export function isChapterAvailable(
  pluginResult: PluginTestResult,
  enableChapter: boolean,
): boolean {
  return pluginResult.chapter.installed && enableChapter
}
