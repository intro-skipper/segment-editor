import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import {
  getPluginCredentials,
  isPluginMode,
  testConnectionWithCredentials,
} from '@/services/jellyfin'
import { useApiStore } from '@/stores/api-store'

type ValidationStatus = 'idle' | 'validating' | 'validated'

interface ConnectionValidationStore {
  status: ValidationStatus
  setStatus: (status: ValidationStatus) => void
}

/**
 * Validation progress is shared app-wide: useConnectionInit (mounted once at
 * the root) drives it, while views like FilterView read it through
 * usePluginMode to distinguish "validating stored credentials" from
 * "stored credentials failed validation". Kept outside the persisted api
 * store because it is per-session progress, not connection configuration.
 */
export const useConnectionValidationStore = create<ConnectionValidationStore>()(
  (set) => ({
    status: 'idle',
    setStatus: (status) => set({ status }),
  }),
)

const setValidationStatus = (status: ValidationStatus): void => {
  useConnectionValidationStore.getState().setStatus(status)
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
  if (result.valid && result.authenticated) {
    useApiStore.setState({
      serverVersion: result.serverVersion,
      validConnection: true,
      validAuth: true,
    })
    return
  }
  useApiStore.getState().setConnectionStatus(false, false)
}

function trySetInvalidConnectionStatus(): void {
  try {
    useApiStore.getState().setConnectionStatus(false, false)
  } catch {
    // Validation completion must not depend on storage availability.
  }
}

const resolveHasCredentials = (
  isPlugin: boolean,
  serverAddress: string,
  apiKey: string | undefined,
): boolean =>
  isPlugin ? getPluginCredentials() !== null : !!(serverAddress && apiKey)

export function useConnectionInit(): ConnectionState {
  const validationStatus = useConnectionValidationStore((s) => s.status)
  const lastAttemptKeyRef = useRef<string | null>(null)

  const { validAuth, serverAddress, apiKey } = useApiStore(
    useShallow((s: ReturnType<typeof useApiStore.getState>) => ({
      validAuth: s.validAuth,
      serverAddress: s.serverAddress,
      apiKey: s.apiKey,
    })),
  )

  const isPlugin = isPluginMode()

  // Validation success is recorded in the api store (validAuth), so a store
  // that already has valid auth counts as validated without a dispatch.
  const isValidating = validationStatus === 'validating'
  const hasValidated = validationStatus === 'validated' || validAuth

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
        if (controller.signal.aborted) return
        const result = await testConnectionWithCredentials(creds, {
          signal: controller.signal,
        })

        if (!controller.signal.aborted) {
          try {
            applyConnectionValidationResult(result)
          } catch {
            trySetInvalidConnectionStatus()
          }
        }
      } catch {
        if (controller.signal.aborted) return
        trySetInvalidConnectionStatus()
      }

      if (!controller.signal.aborted) {
        setValidationStatus('validated')
      }
    }

    void init()
    return () => {
      controller.abort()
      // Allow a remount to retry an attempt that was aborted mid-flight
      // (e.g. StrictMode double-mount); otherwise the dedup key would leave
      // the app stuck in the connecting state with no completed validation.
      if (lastAttemptKeyRef.current === attemptKey) {
        lastAttemptKeyRef.current = null
      }
    }
  }, [isPlugin, validAuth, serverAddress, apiKey])

  const hasCredentials = resolveHasCredentials(isPlugin, serverAddress, apiKey)

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
  const validationStatus = useConnectionValidationStore((s) => s.status)

  const isPlugin = isPluginMode()

  return {
    isPlugin,
    hasCredentials: resolveHasCredentials(isPlugin, serverAddress, apiKey),
    isConnected: validAuth,
    isValidating: validationStatus === 'validating',
    hasValidated: validationStatus === 'validated' || validAuth,
  }
}
