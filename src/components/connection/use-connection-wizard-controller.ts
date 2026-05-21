import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useForm, useStore } from '@tanstack/react-form'
import { canGoBack, getPreviousStep } from './connection-wizard-flow'
import type { WizardStep } from './connection-wizard-flow'

import type { ConnectionWizardFormValues } from '@/lib/forms/connection-form'
import type { RecommendedServerInfo } from '@/types/jellyfin'
import {
  CONNECTION_WIZARD_DEFAULT_VALUES,
  ConnectionAuthSchema,
  ConnectionDiscoverSchema,
  buildCredentialsFromForm,
} from '@/lib/forms/connection-form'
import { useAbortController } from '@/hooks/use-abort-controller'
import {
  authenticate,
  discoverServers,
  findBestServer,
  storeAuthResult,
} from '@/services/jellyfin'

function useConnectionWizardForm(
  step: WizardStep,
  handleFormSubmit: (value: ConnectionWizardFormValues) => Promise<void>,
) {
  return useForm({
    defaultValues: CONNECTION_WIZARD_DEFAULT_VALUES,
    validators: {
      onSubmit:
        step === 'entry'
          ? ConnectionDiscoverSchema
          : step === 'auth'
            ? ConnectionAuthSchema
            : undefined,
    },
    onSubmit: async ({ value }) => {
      await handleFormSubmit(value)
    },
  })
}

type ConnectionWizardFormApi = ReturnType<typeof useConnectionWizardForm>

interface ConnectionWizardController {
  form: ConnectionWizardFormApi
  step: WizardStep
  servers: Array<RecommendedServerInfo>
  selectedServer: RecommendedServerInfo | null
  isRequestPending: boolean
  requestError: string | null
  canGoBack: boolean
  clearRequestError: () => void
  handleDiscoverSubmit: () => Promise<void>
  handleAuthSubmit: () => Promise<void>
  handleRetryAuth: () => void
  handleRetryDiscovery: () => void
  handleServerSelect: (server: RecommendedServerInfo) => void
  handleProceedToAuth: () => void
  handleBack: () => void
  reset: () => void
}

export function useConnectionWizardController(): ConnectionWizardController {
  const { createController, abort } = useAbortController()
  const [step, setStep] = useState<WizardStep>('entry')
  const [servers, setServers] = useState<Array<RecommendedServerInfo>>([])
  const [isRequestPending, setIsRequestPending] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)

  const formRef = useRef<ConnectionWizardFormApi | null>(null)

  const handleFormSubmit = useCallback(
    async (value: ConnectionWizardFormValues) => {
      if (step === 'entry') {
        const controller = createController()
        setIsRequestPending(true)
        setRequestError(null)

        try {
          const result = await discoverServers(value.address, {
            signal: controller.signal,
          })

          if (!controller.signal.aborted) {
            if (result.error) {
              setIsRequestPending(false)
              setRequestError(result.error)
              return
            }

            if (result.servers.length === 0) {
              setIsRequestPending(false)
              setRequestError(
                'No servers found at this address. Check the address and try again.',
              )
              return
            }

            const nextSelectedServer =
              result.servers.find(
                (server) => server.address === value.selectedServerAddress,
              ) ?? findBestServer(result.servers)

            setServers(result.servers)
            setRequestError(null)
            setIsRequestPending(false)
            setStep('select')
            formRef.current?.setFieldValue(
              'selectedServerAddress',
              nextSelectedServer?.address ?? '',
              {
                dontValidate: true,
              },
            )
          }
        } catch (error) {
          if (controller.signal.aborted) return
          setIsRequestPending(false)
          setRequestError(
            error instanceof Error ? error.message : 'Server discovery failed',
          )
        }
        return
      }

      if (step !== 'auth') return

      const selectedServer =
        servers.find(
          (server) => server.address === value.selectedServerAddress,
        ) ?? null

      if (!selectedServer) {
        setStep('select')
        return
      }

      const controller = createController()
      setIsRequestPending(true)
      setRequestError(null)

      const credentials = buildCredentialsFromForm(value)
      try {
        const result = await authenticate(selectedServer.address, credentials, {
          signal: controller.signal,
        })

        if (!controller.signal.aborted) {
          if (!result.success) {
            setIsRequestPending(false)
            setRequestError(result.error ?? 'Authentication failed')
            return
          }

          storeAuthResult(selectedServer.address, result, credentials.method)
          setIsRequestPending(false)
          setRequestError(null)
          setStep('success')
        }
      } catch (error) {
        if (controller.signal.aborted) return
        setIsRequestPending(false)
        setRequestError(
          error instanceof Error ? error.message : 'Authentication failed',
        )
      }
    },
    [createController, servers, step],
  )

  const form = useConnectionWizardForm(step, handleFormSubmit)

  useEffect(() => {
    formRef.current = form
  }, [form])

  useEffect(() => abort, [abort])

  const clearRequestError = useCallback(() => {
    setRequestError(null)
  }, [])

  const reset = useCallback(() => {
    abort()
    setStep('entry')
    setServers([])
    setIsRequestPending(false)
    setRequestError(null)
    form.reset(CONNECTION_WIZARD_DEFAULT_VALUES)
  }, [abort, form])

  const selectedServerAddress = useStore(
    form.store,
    (state) => state.values.selectedServerAddress,
  )

  const selectedServer = useMemo(
    () =>
      servers.find((server) => server.address === selectedServerAddress) ??
      null,
    [selectedServerAddress, servers],
  )

  const handleDiscoverSubmit = useCallback(async () => {
    await form.handleSubmit()
  }, [form])

  const handleAuthSubmit = handleDiscoverSubmit

  const handleRetryDiscovery = useCallback(() => {
    void handleDiscoverSubmit()
  }, [handleDiscoverSubmit])

  const handleRetryAuth = handleRetryDiscovery

  const handleServerSelect = useCallback(
    (server: RecommendedServerInfo) => {
      form.setFieldValue('selectedServerAddress', server.address, {
        dontValidate: true,
      })
      setRequestError(null)
    },
    [form],
  )

  const handleProceedToAuth = useCallback(() => {
    const nextSelectedServerAddress = form.getFieldValue(
      'selectedServerAddress',
    )
    if (!nextSelectedServerAddress.trim()) return
    setRequestError(null)
    setStep('auth')
  }, [form])

  const handleBack = useCallback(() => {
    abort()
    setIsRequestPending(false)
    setRequestError(null)

    const previousStep = getPreviousStep(step)
    if (!previousStep) return
    setStep(previousStep)
  }, [abort, step])

  return {
    form,
    step,
    servers,
    selectedServer,
    isRequestPending,
    requestError,
    canGoBack: canGoBack(step),
    clearRequestError,
    handleDiscoverSubmit,
    handleAuthSubmit,
    handleRetryAuth,
    handleRetryDiscovery,
    handleServerSelect,
    handleProceedToAuth,
    handleBack,
    reset,
  }
}
