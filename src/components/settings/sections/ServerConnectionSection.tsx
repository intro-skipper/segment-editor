import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle, LogOut, Server, XCircle } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { SettingsSection } from '../primitives'
import { useApiStore } from '@/stores/api-store'
import { showNotification } from '@/lib/notifications'
import { Button } from '@/components/ui/button'
import { ConnectionWizard } from '@/components/connection'

export function ServerConnectionSection() {
  const { t } = useTranslation()
  const [wizardOpen, setWizardOpen] = useState(false)

  const {
    serverAddress,
    validConnection,
    validAuth,
    serverVersion,
    username,
    clearAuth,
  } = useApiStore(
    useShallow((s: ReturnType<typeof useApiStore.getState>) => ({
      serverAddress: s.serverAddress,
      validConnection: s.validConnection,
      validAuth: s.validAuth,
      serverVersion: s.serverVersion,
      username: s.username,
      clearAuth: s.clearAuth,
    })),
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
          <DisconnectedState onConnect={handleOpenWizard} />
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
  onConnect: () => void
}

function DisconnectedState({ onConnect }: DisconnectedStateProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t('login.not_connected', 'Not connected to any server')}
      </p>
      <Button
        variant="default"
        onClick={onConnect}
        className="w-full h-9 rounded-lg"
      >
        <Server className="size-4" aria-hidden />
        {t('login.connect', 'Connect to Server')}
      </Button>
    </div>
  )
}
