import { useEffect, useRef, useState } from 'react'

import { useForm, useStore } from '@tanstack/react-form'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const { createController, abort } = useAbortController()
  const [step, setStep] = useState<WizardStep>('entry')
  const [servers, setServers] = useState<Array<RecommendedServerInfo>>([])
  const [isRequestPending, setIsRequestPending] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)

  const formRef = useRef<ConnectionWizardFormApi | null>(null)

  const failRequest = (message: string) => {
    setIsRequestPending(false)
    setRequestError(message)
  }

  const beginRequest = () => {
    const controller = createController()
    setIsRequestPending(true)
    setRequestError(null)
    return controller
  }

  const submitDiscovery = async (value: ConnectionWizardFormValues) => {
    const controller = beginRequest()

    let result: Awaited<ReturnType<typeof discoverServers>>
    try {
      result = await discoverServers(value.address, {
        signal: controller.signal,
      })
    } catch (error) {
      if (controller.signal.aborted) return
      failRequest(
        error instanceof Error
          ? error.message
          : t('connection.error.discoveryFailed', 'Server discovery failed'),
      )
      return
    }

    if (controller.signal.aborted) return

    if (result.error) {
      failRequest(result.error)
      return
    }

    if (result.servers.length === 0) {
      failRequest(
        t(
          'connection.error.noServersFound',
          'No servers found at this address. Check the address and try again.',
        ),
      )
      return
    }

    const matchingServer = result.servers.find(
      (server) => server.address === value.selectedServerAddress,
    )
    const nextSelectedServer =
      matchingServer === undefined
        ? findBestServer(result.servers)
        : matchingServer

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

  const submitAuth = async (value: ConnectionWizardFormValues) => {
    const selectedServer =
      servers.find(
        (server) => server.address === value.selectedServerAddress,
      ) ?? null

    if (!selectedServer) {
      setStep('select')
      return
    }

    const controller = beginRequest()
    const credentials = buildCredentialsFromForm(value)

    let result: Awaited<ReturnType<typeof authenticate>>
    try {
      result = await authenticate(selectedServer.address, credentials, {
        signal: controller.signal,
      })
    } catch (error) {
      if (controller.signal.aborted) return
      failRequest(
        error instanceof Error
          ? error.message
          : t('connection.error.authenticationFailed', 'Authentication failed'),
      )
      return
    }

    if (controller.signal.aborted) return

    if (!result.success) {
      failRequest(
        result.error === undefined
          ? t('connection.error.authenticationFailed', 'Authentication failed')
          : result.error,
      )
      return
    }

    try {
      storeAuthResult(selectedServer.address, result, credentials.method)
    } catch (error) {
      failRequest(
        error instanceof Error
          ? error.message
          : t('connection.error.authenticationFailed', 'Authentication failed'),
      )
      return
    }

    setIsRequestPending(false)
    setRequestError(null)
    setStep('success')
  }

  const handleFormSubmit = async (value: ConnectionWizardFormValues) => {
    if (step === 'entry') {
      await submitDiscovery(value)
      return
    }

    if (step === 'auth') {
      await submitAuth(value)
    }
  }

  const form = useConnectionWizardForm(step, handleFormSubmit)

  useEffect(() => {
    formRef.current = form
  }, [form])

  useEffect(() => abort, [abort])

  const clearRequestError = () => {
    setRequestError(null)
  }

  const reset = () => {
    abort()
    setStep('entry')
    setServers([])
    setIsRequestPending(false)
    setRequestError(null)
    form.reset(CONNECTION_WIZARD_DEFAULT_VALUES)
  }

  const selectedServerAddress = useStore(
    form.store,
    (state) => state.values.selectedServerAddress,
  )

  const selectedServer =
    servers.find((server) => server.address === selectedServerAddress) ?? null

  const handleDiscoverSubmit = async () => {
    await form.handleSubmit()
  }

  const handleAuthSubmit = handleDiscoverSubmit

  const handleRetryDiscovery = () => {
    void handleDiscoverSubmit()
  }

  const handleRetryAuth = handleRetryDiscovery

  const handleServerSelect = (server: RecommendedServerInfo) => {
    form.setFieldValue('selectedServerAddress', server.address, {
      dontValidate: true,
    })
    setRequestError(null)
  }

  const handleProceedToAuth = () => {
    const nextSelectedServerAddress = form.getFieldValue(
      'selectedServerAddress',
    )
    if (!nextSelectedServerAddress.trim()) return
    setRequestError(null)
    setStep('auth')
  }

  const handleBack = () => {
    abort()
    setIsRequestPending(false)
    setRequestError(null)

    const previousStep = getPreviousStep(step)
    if (!previousStep) return
    setStep(previousStep)
  }

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
