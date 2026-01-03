import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CheckCircle,
  Globe,
  Loader2,
  Monitor,
  Palette,
  Server,
  Settings2,
  XCircle,
} from 'lucide-react'
import { useShallow } from 'zustand/shallow'

import type { Locale, Theme } from '@/stores/app-store'
import type { PageSize } from '@/stores/session-store'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { PAGE_SIZE_OPTIONS, useSessionStore } from '@/stores/session-store'
import { useApiStore } from '@/stores/api-store'
import { getEffectiveLocale, useAppStore } from '@/stores/app-store'
import { testConnection } from '@/services/jellyfin/client'
import { isPluginMode } from '@/services/jellyfin/sdk'
import { showNotification } from '@/lib/notifications'
import { isValidServerUrl } from '@/lib/schemas'
import { cn } from '@/lib/utils'

/** Plugin mode singleton - computed once */
const pluginMode = isPluginMode()

export function SettingsDialog() {
  const { t, i18n } = useTranslation()
  const [isTesting, setIsTesting] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  // AbortController ref for cancelling in-flight connection tests
  const testAbortRef = useRef<AbortController | null>(null)

  // Session store - single subscription
  const { settingsOpen, setSettingsOpen, pageSize, setPageSize } =
    useSessionStore(
      useShallow((s) => ({
        settingsOpen: s.settingsOpen,
        setSettingsOpen: s.setSettingsOpen,
        pageSize: s.pageSize,
        setPageSize: s.setPageSize,
      })),
    )

  // Store the trigger element when dialog opens for focus restoration
  useEffect(() => {
    if (settingsOpen) {
      triggerRef.current = document.activeElement as HTMLElement
    }
  }, [settingsOpen])

  // Handle dialog close with focus restoration
  const handleOpenChange = useCallback(
    (open: boolean) => {
      setSettingsOpen(open)
      if (!open) {
        // Cancel any in-flight connection test when dialog closes
        testAbortRef.current?.abort()
        testAbortRef.current = null
        // Restore focus to the element that triggered the dialog
        setTimeout(() => {
          triggerRef.current?.focus()
        }, 0)
      }
    },
    [setSettingsOpen],
  )

  // API store - single subscription
  const {
    serverAddress,
    setServerAddress,
    apiKey,
    setApiKey,
    validConnection,
    validAuth,
    serverVersion,
  } = useApiStore(
    useShallow((s) => ({
      serverAddress: s.serverAddress,
      setServerAddress: s.setServerAddress,
      apiKey: s.apiKey,
      setApiKey: s.setApiKey,
      validConnection: s.validConnection,
      validAuth: s.validAuth,
      serverVersion: s.serverVersion,
    })),
  )

  // App store - single subscription
  const { theme, setTheme, locale, setLocale, providerId, setProviderId } =
    useAppStore(
      useShallow((s) => ({
        theme: s.theme,
        setTheme: s.setTheme,
        locale: s.locale,
        setLocale: s.setLocale,
        providerId: s.providerId,
        setProviderId: s.setProviderId,
      })),
    )

  const handleTestConnection = useCallback(async () => {
    // Validate URL format
    if (!isValidServerUrl(serverAddress)) {
      setUrlError(t('login.validation.url_invalid'))
      showNotification({
        type: 'negative',
        message: t('login.validation.url_invalid'),
      })
      return
    }

    // Cancel any previous in-flight test
    testAbortRef.current?.abort()
    const controller = new AbortController()
    testAbortRef.current = controller

    setUrlError(null)
    setIsTesting(true)
    try {
      const result = await testConnection({ signal: controller.signal })
      // Check if request was cancelled
      if (result.cancelled) return

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
      // Only show error if not cancelled
      if (!controller.signal.aborted) {
        showNotification({
          type: 'negative',
          message: t('login.connect_fail'),
        })
      }
    } finally {
      // Only update state if not cancelled
      if (!controller.signal.aborted) {
        setIsTesting(false)
      }
    }
  }, [serverAddress, t])

  const handleServerAddressChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setServerAddress(value)
      // Clear error when user starts typing
      if (urlError) {
        setUrlError(null)
      }
    },
    [setServerAddress, urlError],
  )

  const handleLocaleChange = useCallback(
    (newLocale: Locale) => {
      setLocale(newLocale)
      // Apply resolved locale to i18next
      i18n.changeLanguage(getEffectiveLocale(newLocale))
    },
    [setLocale, i18n],
  )

  return (
    <Dialog open={settingsOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md p-0 bg-popover/95 backdrop-blur-xl border-border/50 shadow-2xl overflow-hidden"
        aria-describedby="settings-description"
        showCloseButton={false}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <div className="size-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Settings2 className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold">
              {t('app.title')} Settings
            </h2>
            <p
              id="settings-description"
              className="text-xs text-muted-foreground"
            >
              Configure your preferences
            </p>
          </div>
        </div>

        <div className="max-h-[min(480px,70vh)] overflow-y-auto px-3 pb-3">
          {/* Server Connection Section */}
          {!pluginMode && (
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
              <div className="space-y-3">
                <SettingsField label={t('login.server_address')}>
                  <input
                    id="server-address"
                    type="url"
                    placeholder="https://jellyfin.example.com"
                    value={serverAddress}
                    onChange={handleServerAddressChange}
                    aria-invalid={!!urlError}
                    aria-describedby={urlError ? 'server-url-error' : undefined}
                    className={cn(
                      'w-full h-9 px-3 rounded-lg bg-muted/60 text-sm outline-none transition-colors',
                      'placeholder:text-muted-foreground',
                      'focus:bg-muted focus:ring-2 focus:ring-ring/50',
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

                <SettingsField label={t('login.api_key')}>
                  <input
                    id="api-key"
                    type="password"
                    placeholder="••••••••••••••••"
                    value={apiKey || ''}
                    onChange={(e) => setApiKey(e.target.value || undefined)}
                    className="w-full h-9 px-3 rounded-lg bg-muted/60 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:bg-muted focus:ring-2 focus:ring-ring/50"
                  />
                </SettingsField>

                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={isTesting || !serverAddress}
                  className="w-full h-9 rounded-lg"
                  aria-busy={isTesting}
                  aria-live="polite"
                >
                  {isTesting && (
                    <>
                      <Loader2
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                      <span className="sr-only">Testing connection</span>
                    </>
                  )}
                  {t('login.test_conn')}
                </Button>
              </div>
            </SettingsSection>
          )}

          {/* Appearance Section */}
          <SettingsSection icon={Palette} title={t('app.theme.title')}>
            <Select
              value={theme}
              onValueChange={(value) => setTheme(value as Theme)}
            >
              <SelectTrigger className="w-full h-9 rounded-lg bg-muted/60 border-0 focus:ring-2 focus:ring-ring/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t('app.theme.system')}</SelectItem>
                <SelectItem value="dark">{t('app.theme.dark')}</SelectItem>
                <SelectItem value="light">{t('app.theme.light')}</SelectItem>
              </SelectContent>
            </Select>
          </SettingsSection>

          {/* Language Section */}
          <SettingsSection icon={Globe} title={t('app.locale.title')}>
            <Select
              value={locale}
              onValueChange={(value) => handleLocaleChange(value as Locale)}
            >
              <SelectTrigger className="w-full h-9 rounded-lg bg-muted/60 border-0 focus:ring-2 focus:ring-ring/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t('app.locale.auto')}</SelectItem>
                <SelectItem value="en-US">{t('app.locale.en-US')}</SelectItem>
                <SelectItem value="de">{t('app.locale.de')}</SelectItem>
                <SelectItem value="fr">{t('app.locale.fr')}</SelectItem>
              </SelectContent>
            </Select>
          </SettingsSection>

          {/* Provider Section */}
          <SettingsSection icon={Monitor} title={t('provider.title')}>
            <Select
              value={providerId}
              onValueChange={(value) => value && setProviderId(value)}
            >
              <SelectTrigger className="w-full h-9 rounded-lg bg-muted/60 border-0 focus:ring-2 focus:ring-ring/50">
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
          </SettingsSection>

          {/* Page Size Section */}
          <SettingsSection
            icon={Settings2}
            title={t('items.perPage', { defaultValue: 'Items per page' })}
          >
            <Select
              value={String(pageSize)}
              onValueChange={(value) =>
                value && setPageSize(Number(value) as PageSize)
              }
            >
              <SelectTrigger className="w-full h-9 rounded-lg bg-muted/60 border-0 focus:ring-2 focus:ring-ring/50">
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
          </SettingsSection>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Helper components for consistent styling
interface SettingsSectionProps {
  icon: typeof Settings2
  title: string
  badge?: React.ReactNode
  children: React.ReactNode
}

function SettingsSection({
  icon: Icon,
  title,
  badge,
  children,
}: SettingsSectionProps) {
  return (
    <div className="p-3 rounded-xl hover:bg-muted/40 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            {title}
          </span>
        </div>
        {badge}
      </div>
      {children}
    </div>
  )
}

interface SettingsFieldProps {
  label: string
  children: React.ReactNode
}

function SettingsField({ label, children }: SettingsFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

export default SettingsDialog
