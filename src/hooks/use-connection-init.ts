/**
 * Connection initialization hook.
 *
 * Handles both plugin mode (credentials from parent window) and
 * standalone mode (credentials from persisted store).
 *
 * @module hooks/use-connection-init
 */

import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  getPluginCredentials,
  isPluginMode,
  testConnectionWithCredentials,
} from '@/services/jellyfin'
import { useApiStore } from '@/stores/api-store'

interface ConnectionState {
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
 * Initializes connection on app startup.
 * Call once in root component — other components should use `usePluginMode`.
 */
export function useConnectionInit(): ConnectionState {
  const [isValidating, setIsValidating] = useState(false)
  const [hasValidated, setHasValidated] = useState(false)
  const hasAttemptedRef = useRef(false)

  const { validAuth, serverAddress, apiKey } = useApiStore(
    useShallow((s: ReturnType<typeof useApiStore.getState>) => ({
      validAuth: s.validAuth,
      serverAddress: s.serverAddress,
      apiKey: s.apiKey,
    })),
  )

  const isPlugin = isPluginMode()

  useEffect(() => {
    if (validAuth || hasAttemptedRef.current) return

    hasAttemptedRef.current = true
    const controller = new AbortController()

    const init = async () => {
      // Get credentials based on mode
      const pluginCreds = isPlugin ? getPluginCredentials() : null
      const standaloneCreds =
        !isPlugin && serverAddress && apiKey
          ? { serverAddress, accessToken: apiKey }
          : null
      const creds = pluginCreds ?? standaloneCreds

      // No credentials available
      if (!creds) {
        setHasValidated(true)
        return
      }

      // In plugin mode, trust the parent's credentials immediately
      if (isPlugin) {
        const store = useApiStore.getState()
        store.setServerAddress(creds.serverAddress)
        store.setApiKey(creds.accessToken)
        store.setAuthMethod('apiKey')
        store.setConnectionStatus(true, true)
        setHasValidated(true)
        return
      }

      // Standalone mode: validate credentials before marking as connected
      setIsValidating(true)

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
      }

      setIsValidating(false)
      setHasValidated(true)
    }

    init()
    return () => controller.abort()
  }, [isPlugin, validAuth, serverAddress, apiKey])

  // Derive hasCredentials after effect to ensure consistency
  const hasCredentials = isPlugin
    ? getPluginCredentials() !== null
    : !!(serverAddress && apiKey)

  return {
    isPlugin,
    hasCredentials,
    isConnected: validAuth,
    isValidating,
    hasValidated,
    showWizard: hasValidated && !validAuth && !isPlugin,
  }
}

/**
 * Hook for components that need connection state.
 * Does NOT initialize connection - use after `useConnectionInit` in root.
 */
export function usePluginMode() {
  const { validAuth, serverAddress, apiKey } = useApiStore(
    useShallow((s: ReturnType<typeof useApiStore.getState>) => ({
      validAuth: s.validAuth,
      serverAddress: s.serverAddress,
      apiKey: s.apiKey,
    })),
  )

  const isPlugin = isPluginMode()

  return {
    isPlugin,
    hasCredentials: isPlugin
      ? getPluginCredentials() !== null
      : !!(serverAddress && apiKey),
    isConnected: validAuth,
  }
}
