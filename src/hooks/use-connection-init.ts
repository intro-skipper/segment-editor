/**
 * Hook for initializing connection on app startup.
 *
 * Handles both plugin mode (credentials from parent window) and
 * standalone mode (credentials from persisted store).
 *
 * @module hooks/use-connection-init
 */

import { useEffect, useRef, useState } from 'react'
import {
  getPluginCredentials,
  isPluginMode,
  testConnectionWithCredentials,
} from '@/services/jellyfin'
import { useApiStore } from '@/stores/api-store'

interface ConnectionInitState {
  /** Whether running inside Jellyfin as a plugin iframe */
  isPlugin: boolean
  /** Whether credentials are available */
  hasCredentials: boolean
  /** Whether connection has been validated */
  isConnected: boolean
  /** Whether currently validating connection */
  isValidating: boolean
  /** Whether validation has completed (success or failure) */
  hasValidated: boolean
  /** Whether to show the connection wizard */
  showWizard: boolean
}

/**
 * Connection initialization hook.
 * Automatically validates credentials on startup for both plugin and standalone modes.
 */
export function useConnectionInit(): ConnectionInitState {
  const [isValidating, setIsValidating] = useState(false)
  const [hasValidated, setHasValidated] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const hasAttemptedRef = useRef(false)

  const validAuth = useApiStore((s) => s.validAuth)
  const serverAddress = useApiStore((s) => s.serverAddress)
  const apiKey = useApiStore((s) => s.apiKey)

  const isPlugin = isPluginMode()
  const pluginCreds = isPlugin ? getPluginCredentials() : null

  const hasCredentials = isPlugin
    ? pluginCreds !== null
    : !!(serverAddress && apiKey)

  // Initialize connection on mount
  useEffect(() => {
    if (validAuth || hasAttemptedRef.current) return

    hasAttemptedRef.current = true
    const controller = new AbortController()

    const initConnection = async () => {
      // Determine credentials source
      const creds = isPlugin
        ? pluginCreds
        : serverAddress && apiKey
          ? { serverAddress, accessToken: apiKey }
          : null

      // No credentials available
      if (!creds) {
        setHasValidated(true)
        if (!isPlugin) setShowWizard(true)
        return
      }

      setIsValidating(true)

      // Store plugin credentials if in plugin mode
      if (isPlugin) {
        const store = useApiStore.getState()
        store.setServerAddress(creds.serverAddress)
        store.setApiKey(creds.accessToken)
        store.setAuthMethod('apiKey')
      }

      // Validate connection
      const result = await testConnectionWithCredentials(creds, {
        signal: controller.signal,
      })

      if (controller.signal.aborted) return

      const store = useApiStore.getState()

      if (result.valid && result.authenticated) {
        store.setServerVersion(result.serverVersion)
        store.setConnectionStatus(true, true)
      } else {
        store.setConnectionStatus(false, false)
        if (!isPlugin) setShowWizard(true)
      }

      setIsValidating(false)
      setHasValidated(true)
    }

    initConnection()

    return () => controller.abort()
  }, [isPlugin, validAuth, serverAddress, apiKey, pluginCreds])

  return {
    isPlugin,
    hasCredentials,
    isConnected: validAuth,
    isValidating,
    hasValidated,
    showWizard,
  }
}

/** Alias for components using the old hook name */
export function usePluginMode() {
  const state = useConnectionInit()
  return {
    isPlugin: state.isPlugin,
    hasCredentials: state.hasCredentials,
    isConnected: state.isConnected,
    isConnecting: state.isValidating,
  }
}
