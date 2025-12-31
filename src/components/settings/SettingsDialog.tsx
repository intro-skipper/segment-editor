import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle, Loader2, XCircle } from 'lucide-react'

import type { Locale, Theme } from '@/stores/app-store'
import type { PageSize } from '@/stores/session-store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { PAGE_SIZE_OPTIONS, useSessionStore } from '@/stores/session-store'
import { useApiStore } from '@/stores/api-store'
import { useAppStore } from '@/stores/app-store'
import { testConnection } from '@/services/jellyfin/client'
import { showNotification } from '@/lib/notifications'

export function SettingsDialog() {
  const { t, i18n } = useTranslation()
  const [isTesting, setIsTesting] = useState(false)

  // Session store
  const settingsOpen = useSessionStore((state) => state.settingsOpen)
  const setSettingsOpen = useSessionStore((state) => state.setSettingsOpen)
  const pageSize = useSessionStore((state) => state.pageSize)
  const setPageSize = useSessionStore((state) => state.setPageSize)

  // API store
  const serverAddress = useApiStore((state) => state.serverAddress)
  const setServerAddress = useApiStore((state) => state.setServerAddress)
  const apiKey = useApiStore((state) => state.apiKey)
  const setApiKey = useApiStore((state) => state.setApiKey)
  const validConnection = useApiStore((state) => state.validConnection)
  const validAuth = useApiStore((state) => state.validAuth)
  const serverVersion = useApiStore((state) => state.serverVersion)
  const isPluginMode = useApiStore((state) => state.isPluginMode)

  // App store
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  const locale = useAppStore((state) => state.locale)
  const setLocale = useAppStore((state) => state.setLocale)
  const providerId = useAppStore((state) => state.providerId)
  const setProviderId = useAppStore((state) => state.setProviderId)

  const handleTestConnection = async () => {
    // Validate URL format
    if (
      !serverAddress.startsWith('http://') &&
      !serverAddress.startsWith('https://')
    ) {
      showNotification({
        type: 'negative',
        message: t('login.validation.url_invalid'),
      })
      return
    }

    setIsTesting(true)
    try {
      const result = await testConnection()
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
      showNotification({
        type: 'negative',
        message: t('login.connect_fail'),
      })
    } finally {
      setIsTesting(false)
    }
  }

  const handleLocaleChange = (newLocale: Locale) => {
    setLocale(newLocale)
    // Apply locale to i18next
    if (newLocale === 'auto') {
      const browserLang = navigator.language
      if (browserLang.startsWith('de')) {
        i18n.changeLanguage('de')
      } else if (browserLang.startsWith('fr')) {
        i18n.changeLanguage('fr')
      } else {
        i18n.changeLanguage('en-US')
      }
    } else {
      i18n.changeLanguage(newLocale)
    }
  }

  return (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('app.title')} Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Server Connection Section */}
          {!isPluginMode && (
            <>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Server Connection</h3>
                  {validConnection && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {validAuth ? (
                        <CheckCircle className="size-3.5 text-green-500" />
                      ) : (
                        <XCircle className="size-3.5 text-destructive" />
                      )}
                      <span>{serverVersion || 'Connected'}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="server-address">
                      {t('login.server_address')}
                    </Label>
                    <Input
                      id="server-address"
                      type="url"
                      placeholder="https://jellyfin.example.com"
                      value={serverAddress}
                      onChange={(e) => setServerAddress(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="api-key">{t('login.api_key')}</Label>
                    <Input
                      id="api-key"
                      type="password"
                      placeholder="••••••••••••••••"
                      value={apiKey || ''}
                      onChange={(e) => setApiKey(e.target.value || undefined)}
                    />
                  </div>

                  <Button
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={isTesting || !serverAddress}
                    className="w-full"
                  >
                    {isTesting && <Loader2 className="size-4 animate-spin" />}
                    {t('login.test_conn')}
                  </Button>
                </div>
              </div>

              <Separator />
            </>
          )}

          {/* Theme Selection */}
          <div className="space-y-3">
            <Label>{t('app.theme.title')}</Label>
            <Select
              value={theme}
              onValueChange={(value) => setTheme(value as Theme)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t('app.theme.system')}</SelectItem>
                <SelectItem value="dark">{t('app.theme.dark')}</SelectItem>
                <SelectItem value="light">{t('app.theme.light')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Language Selection */}
          <div className="space-y-3">
            <Label>{t('app.locale.title')}</Label>
            <Select
              value={locale}
              onValueChange={(value) => handleLocaleChange(value as Locale)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t('app.locale.auto')}</SelectItem>
                <SelectItem value="en-US">{t('app.locale.en-US')}</SelectItem>
                <SelectItem value="de">{t('app.locale.de')}</SelectItem>
                <SelectItem value="fr">{t('app.locale.fr')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Provider Selection */}
          <div className="space-y-3">
            <Label>{t('provider.title')}</Label>
            <Select
              value={providerId}
              onValueChange={(value) => value && setProviderId(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SegmentEditor">
                  {t('provider.segment')}
                </SelectItem>
                <SelectItem value="IntroSkipper">
                  {t('provider.skipper')}
                </SelectItem>
                <SelectItem value="ChapterSegments">
                  {t('provider.chapter')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Page Size Selection */}
          <div className="space-y-3">
            <Label>
              {t('items.perPage', { defaultValue: 'Items per page' })}
            </Label>
            <Select
              value={String(pageSize)}
              onValueChange={(value) =>
                value && setPageSize(Number(value) as PageSize)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default SettingsDialog
