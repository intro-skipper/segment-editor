/**
 * Connection Test Hook
 *
 * Manages connection testing with proper abort handling.
 * Uses centralized useAbortController for DRY compliance.
 *
 * @module components/settings/hooks/use-connection-test
 */

import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAbortController } from '@/hooks/use-abort-controller'
import { testConnection } from '@/services/jellyfin'
import { showNotification } from '@/lib/notifications'
import { isValidServerUrl } from '@/lib/schemas'

export interface UseConnectionTestOptions {
  serverAddress: string
}

export interface UseConnectionTestReturn {
  isTesting: boolean
  urlError: string | null
  setUrlError: (error: string | null) => void
  handleTestConnection: () => Promise<void>
  cancelTest: () => void
}

export function useConnectionTest({
  serverAddress,
}: UseConnectionTestOptions): UseConnectionTestReturn {
  const { t } = useTranslation()
  const [isTesting, setIsTesting] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)
  const { createController, abort: cancelTest } = useAbortController()

  const handleTestConnection = useCallback(async () => {
    if (!isValidServerUrl(serverAddress)) {
      setUrlError(t('login.validation.url_invalid'))
      showNotification({
        type: 'negative',
        message: t('login.validation.url_invalid'),
      })
      return
    }

    const controller = createController()
    setUrlError(null)
    setIsTesting(true)

    try {
      const result = await testConnection({ signal: controller.signal })

      if (controller.signal.aborted) return

      if (result.valid) {
        if (result.authenticated) {
          showNotification({
            type: 'positive',
            message: `Connected to Jellyfin ${result.serverVersion}`,
          })
        } else {
          showNotification({
            type: 'negative',
            message: t('login.auth_fail'),
          })
        }
      } else {
        showNotification({
          type: 'negative',
          message: t('login.connect_fail'),
        })
      }
    } catch {
      if (!controller.signal.aborted) {
        showNotification({
          type: 'negative',
          message: t('login.connect_fail'),
        })
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsTesting(false)
      }
    }
  }, [serverAddress, t, createController])

  return {
    isTesting,
    urlError,
    setUrlError,
    handleTestConnection,
    cancelTest,
  }
}
