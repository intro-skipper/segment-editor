import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  getPluginCredentials,
  isPluginMode,
  testConnectionWithCredentials,
} from '@/services/jellyfin'
import { useApiStore } from '@/stores/api-store'

type ValidationStatus = 'idle' | 'validating' | 'validated'

const validationStateByStatus: Record<
  ValidationStatus,
  { isValidating: boolean; hasValidated: boolean }
> = {
  idle: { isValidating: false, hasValidated: false },
  validating: { isValidating: true, hasValidated: false },
  validated: { isValidating: false, hasValidated: true },
}

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

type ConnectionValidationResult = Awaited<
  ReturnType<typeof testConnectionWithCredentials>
>

function applyConnectionValidationResult(
  result: ConnectionValidationResult,
): void {
  const store = useApiStore.getState()
  if (result.valid) {
    if (result.authenticated) {
      useApiStore.setState({
        serverVersion: result.serverVersion,
        validConnection: true,
        validAuth: true,
      })
    } else {
      store.setConnectionStatus(false, false)
    }
  } else {
    store.setConnectionStatus(false, false)
  }
}

function trySetInvalidConnectionStatus(): void {
  try {
    useApiStore.getState().setConnectionStatus(false, false)
  } catch {
    // Validation completion must not depend on storage availability.
  }
}

export function useConnectionInit(): ConnectionState {
  const [validationStatus, setValidationStatus] =
    useState<ValidationStatus>('idle')
  const { isValidating, hasValidated: hasValidatedByStatus } =
    validationStateByStatus[validationStatus]
  const lastAttemptKeyRef = useRef<string | null>(null)

  const { validAuth, serverAddress, apiKey } = useApiStore(
    useShallow((s: ReturnType<typeof useApiStore.getState>) => ({
      validAuth: s.validAuth,
      serverAddress: s.serverAddress,
      apiKey: s.apiKey,
    })),
  )

  const isPlugin = isPluginMode()

  // Derive hasValidated: also true when the store already has valid auth,
  // so we don't need an explicit dispatch for the validAuth early-return path.
  const hasValidated = hasValidatedByStatus || validAuth

  useEffect(() => {
    if (validAuth) {
      return
    }

    const attemptKey = isPlugin
      ? 'plugin'
      : `standalone:${serverAddress}:${apiKey ?? ''}`
    if (lastAttemptKeyRef.current === attemptKey) return
    lastAttemptKeyRef.current = attemptKey

    const controller = new AbortController()

    const init = async () => {
      const pluginCreds = isPlugin ? getPluginCredentials() : null
      const standaloneCreds =
        !isPlugin && serverAddress && apiKey
          ? { serverAddress, accessToken: apiKey }
          : null
      const creds = pluginCreds ?? standaloneCreds

      // No credentials available — showWizard handles this via !hasCredentials
      if (!creds) {
        return
      }

      // In plugin mode, trust the parent's credentials immediately
      if (isPlugin) {
        useApiStore.setState({
          serverAddress: creds.serverAddress.trim(),
          apiKey: creds.accessToken.trim() || undefined,
          authMethod: 'apiKey',
          validConnection: true,
          validAuth: true,
        })
        // No dispatch needed: hasValidated derives from validAuth becoming true
        return
      }

      // Standalone mode: validate credentials before marking as connected
      setValidationStatus('validating')

      try {
        const result = await testConnectionWithCredentials(creds, {
          signal: controller.signal,
        })
        if (controller.signal.aborted) return

        try {
          applyConnectionValidationResult(result)
        } catch {
          trySetInvalidConnectionStatus()
        }
      } catch {
        if (controller.signal.aborted) return
        trySetInvalidConnectionStatus()
      }

      const isValidationActive = () => !controller.signal.aborted
      if (isValidationActive()) {
        setValidationStatus('validated')
      }
    }

    void init()
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
    showWizard: !isPlugin && !validAuth && (hasValidated || !hasCredentials),
  }
}

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
