/**
 * Hook for detecting and managing Jellyfin plugin mode.
 *
 * When running as an iframe inside Jellyfin, credentials are automatically
 * obtained from the parent window's ApiClient. This hook provides:
 * - Plugin mode detection
 * - Connection readiness state
 * - Auto-connection when credentials become available
 */

import { useEffect, useState } from 'react'
import { isPluginMode, getServerBaseUrl, getAccessToken } from '@/services/jellyfin/sdk'
import { testConnection } from '@/services/jellyfin/client'
import { useApiStore } from '@/stores/api-store'

interface PluginModeState {
  /** Whether running inside Jellyfin as a plugin iframe */
  isPlugin: boolean
  /** Whether credentials are available (plugin or manual) */
  hasCredentials: boolean
  /** Whether connection has been validated */
  isConnected: boolean
  /** Whether currently testing connection */
  isConnecting: boolean
}

/**
 * Detects plugin mode and manages automatic connection.
 * In plugin mode, automatically tests connection when parent ApiClient is available.
 */
export function usePluginMode(): PluginModeState {
  const [isConnecting, setIsConnecting] = useState(false)
  const validConnection = useApiStore((s) => s.validConnection)
  const serverAddress = useApiStore((s) => s.serverAddress)
  const apiKey = useApiStore((s) => s.apiKey)

  // Check plugin mode and credentials dynamically
  const isPlugin = isPluginMode()
  const pluginServerUrl = getServerBaseUrl()
  const pluginToken = getAccessToken()

  // Has credentials from either plugin mode or manual entry
  const hasCredentials = isPlugin
    ? !!(pluginServerUrl && pluginToken)
    : !!(serverAddress && apiKey)

  // Auto-connect in plugin mode when credentials become available
  useEffect(() => {
    if (!isPlugin || !hasCredentials || validConnection) return

    const controller = new AbortController()
    setIsConnecting(true)

    testConnection({ signal: controller.signal }).finally(() => {
      if (!controller.signal.aborted) {
        setIsConnecting(false)
      }
    })

    return () => controller.abort()
  }, [isPlugin, hasCredentials, validConnection])

  return {
    isPlugin,
    hasCredentials,
    isConnected: validConnection,
    isConnecting,
  }
}
