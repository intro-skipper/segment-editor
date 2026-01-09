import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle, Loader2, LogOut, Server, XCircle } from 'lucide-react'
import { useShallow } from 'zustand/shallow'

import { SettingsField, SettingsSection } from '../primitives'
import { useConnectionTest } from '../hooks'
import { useApiStore } from '@/stores/api-store'
import { showNotification } from '@/lib/notifications'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConnectionWizard } from '@/components/connection'

export function ServerConnectionSection() {
  const { t } = useTranslation()
  const [wizardOpen, setWizardOpen] = useState(false)

  const {
    serverAddress,
    setServerAddress,
    apiKey,
    setApiKey,
    validConnection,
    validAuth,
    serverVersion,
    username,
    clearAuth,
  } = useApiStore(
    useShallow((s) => ({
      serverAddress: s.serverAddress,
      setServerAddress: s.setServerAddress,
      apiKey: s.apiKey,
      setApiKey: s.setApiKey,
      validConnection: s.validConnection,
      validAuth: s.validAuth,
      serverVersion: s.serverVersion,
      username: s.username,
      clearAuth: s.clearAuth,
    })),
  )

  const { isTesting, urlError, setUrlError, handleTestConnection } =
    useConnectionTest({ serverAddress })

  const handleServerAddressChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setServerAddress(e.target.value)
      setUrlError(null) // Always clear error on input change
    },
    [setServerAddress, setUrlError],
  )

  const handleOpenWizard = useCallback(() => setWizardOpen(true), [])

  const handleWizardComplete = useCallback(() => {
    showNotification({
      type: 'positive',
      message: t('login.connect_success', 'Successfully connected to server'),
    })
  }, [t])

  const handleDisconnect = useCallback(() => {
    clearAuth()
    showNotification({
      type: 'info',
      message: t('login.disconnected', 'Disconnected from server'),
    })
  }, [clearAuth, t])

  const isConnected = validConnection && validAuth

  return (
    <>
      <SettingsSection
        icon={Server}
        title="Server Connection"
        badge={
          validConnection ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {validAuth ? (
                <CheckCircle className="size-3.5 text-green-500" />
              ) : (
                <XCircle className="size-3.5 text-destructive" />
              )}
              <span>{serverVersion || 'Connected'}</span>
            </div>
          ) : null
        }
      >
        {isConnected ? (
          <ConnectedState
            serverAddress={serverAddress}
            username={username}
            onChangeServer={handleOpenWizard}
            onDisconnect={handleDisconnect}
          />
        ) : (
          <DisconnectedState
            serverAddress={serverAddress}
            apiKey={apiKey}
            urlError={urlError}
            isTesting={isTesting}
            onServerAddressChange={handleServerAddressChange}
            onApiKeyChange={(e) => setApiKey(e.target.value || undefined)}
            onTestConnection={handleTestConnection}
            onConnect={handleOpenWizard}
          />
        )}
      </SettingsSection>

      <ConnectionWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onComplete={handleWizardComplete}
      />
    </>
  )
}

// Sub-components for cleaner separation

interface ConnectedStateProps {
  serverAddress: string
  username: string | undefined
  onChangeServer: () => void
  onDisconnect: () => void
}

function ConnectedState({
  serverAddress,
  username,
  onChangeServer,
  onDisconnect,
}: ConnectedStateProps) {
  return (
    <div className="space-y-3">
      <div className="p-3 rounded-lg bg-muted/60">
        <p className="text-sm font-medium truncate">{serverAddress}</p>
        {username && (
          <p className="text-xs text-muted-foreground mt-1">
            Logged in as {username}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={onChangeServer}
          className="flex-1 h-9 rounded-lg"
        >
          <Server className="size-4" aria-hidden />
          Change Server
        </Button>
        <Button
          variant="outline"
          onClick={onDisconnect}
          className="h-9 rounded-lg text-destructive hover:text-destructive"
        >
          <LogOut className="size-4" aria-hidden />
          Disconnect
        </Button>
      </div>
    </div>
  )
}

interface DisconnectedStateProps {
  serverAddress: string
  apiKey: string | undefined
  urlError: string | null
  isTesting: boolean
  onServerAddressChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onApiKeyChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onTestConnection: () => void
  onConnect: () => void
}

function DisconnectedState({
  serverAddress,
  apiKey,
  urlError,
  isTesting,
  onServerAddressChange,
  onApiKeyChange,
  onTestConnection,
  onConnect,
}: DisconnectedStateProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-3">
      <SettingsField label={t('login.server_address')} htmlFor="server-address">
        <Input
          id="server-address"
          type="text"
          inputMode="url"
          placeholder="https://jellyfin.example.com"
          value={serverAddress}
          onChange={onServerAddressChange}
          aria-invalid={!!urlError}
          aria-describedby={urlError ? 'server-url-error' : undefined}
          className={cn(
            'bg-muted/60 border-0 focus-visible:ring-ring/50',
            urlError && 'ring-2 ring-destructive/50',
          )}
        />
        {urlError && (
          <p
            id="server-url-error"
            className="text-xs text-destructive mt-1"
            role="alert"
          >
            {urlError}
          </p>
        )}
      </SettingsField>

      <SettingsField label={t('login.api_key')} htmlFor="api-key">
        <Input
          id="api-key"
          type="password"
          placeholder="••••••••••••••••"
          value={apiKey || ''}
          onChange={onApiKeyChange}
          className="bg-muted/60 border-0 focus-visible:ring-ring/50"
        />
      </SettingsField>

      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={onTestConnection}
          disabled={isTesting || !serverAddress}
          className="flex-1 h-9 rounded-lg"
          aria-busy={isTesting}
          aria-live="polite"
        >
          {isTesting && (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span className="sr-only">Testing connection</span>
            </>
          )}
          {t('login.test_conn')}
        </Button>
        <Button
          variant="default"
          onClick={onConnect}
          className="h-9 rounded-lg"
        >
          <Server className="size-4" aria-hidden />
          Connect
        </Button>
      </div>
    </div>
  )
}
