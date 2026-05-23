import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useEffectEvent,
  useState,
} from 'react'
import { Link, Outlet, useNavigate, useRouter } from '@tanstack/react-router'

import { useTranslation } from 'react-i18next'
import { ArrowLeft, Home } from 'lucide-react'
import { HotkeysProvider } from '@tanstack/react-hotkeys'
import { toast } from 'sonner'

import Header from '../components/Header'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Toaster } from '../components/ui/sonner'
import { Button } from '../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card'

import { useConnectionInit } from '../hooks/use-connection-init'
import { registerPwaUpdates } from '../lib/pwa'
import { isPluginMode } from '../services/jellyfin/core'
import { useSessionStore } from '../stores/session-store'

const DevTools = import.meta.env.DEV
  ? lazy(() =>
      import('../components/DevTools').then((module) => ({
        default: module.DevTools,
      })),
    )
  : null

const SettingsDialog = lazy(() =>
  import('../components/settings').then((module) => ({
    default: module.SettingsDialog,
  })),
)

const ConnectionWizard = lazy(() =>
  import('../components/connection/ConnectionWizard').then((module) => ({
    default: module.ConnectionWizard,
  })),
)

const selectSettingsOpen = (
  state: ReturnType<typeof useSessionStore.getState>,
) => state.settingsOpen

const pluginMode = isPluginMode()

function HeaderFallback() {
  const { t } = useTranslation()
  const router = useRouter()

  const handleRefresh = useCallback(() => {
    void router.invalidate()
  }, [router])

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/80">
      <nav className="px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="text-xl font-bold">
            {t('app.name', 'Segment Editor')}
          </Link>
          <Button variant="ghost" size="sm" onClick={handleRefresh}>
            {t('common.reload', 'Reload')}
          </Button>
        </div>
      </nav>
    </header>
  )
}

export function NotFoundComponent() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const handleGoBack = useCallback(() => {
    void navigate({ to: '/' })
  }, [navigate])

  return (
    <div className="flex min-h-[var(--spacing-page-min-height-sm)] items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="space-y-4">
          <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-muted">
            <span className="text-4xl font-bold text-muted-foreground">
              404
            </span>
          </div>
          <CardTitle className="text-2xl">
            {t('error.not_found', 'Page Not Found')}
          </CardTitle>
          <CardDescription>
            {t(
              'error.not_found_description',
              "The page you're looking for doesn't exist or has been moved.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button variant="outline" onClick={handleGoBack}>
            <ArrowLeft className="size-4" />
            {t('common.go_back', 'Go Back')}
          </Button>
          <Link to="/">
            <Button>
              <Home className="size-4" />
              {t('common.home', 'Home')}
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Root layout component that initializes the application.
 * - Auto-connects in plugin mode when parent ApiClient is available
 * - Validates persisted credentials on startup for standalone mode
 * - Shows connection wizard if credentials are invalid/expired
 * - Renders global UI elements (Header, Settings, Toaster)
 */
export function RootComponent() {
  const { t } = useTranslation()
  const showSkipToMain = !pluginMode

  const updateToastId = 'pwa-update-available'

  const onNeedRefresh = useEffectEvent((applyUpdate: () => Promise<void>) => {
    toast.info(t('pwa.updateAvailableTitle', 'New version available'), {
      id: updateToastId,
      description: t(
        'pwa.updateAvailableDescription',
        'A new app version is ready. Refresh to apply the update.',
      ),
      duration: Infinity,
      action: {
        label: t('pwa.updateNow', 'Update now'),
        onClick: () => {
          void applyUpdate()
        },
      },
      cancel: {
        label: t('pwa.later', 'Later'),
        onClick: () => {
          toast.dismiss(updateToastId)
        },
      },
    })
  })

  useEffect(() => {
    if (pluginMode) return

    void registerPwaUpdates({ onNeedRefresh })

    return () => {
      toast.dismiss(updateToastId)
    }
  }, [])

  const { showWizard } = useConnectionInit()
  const settingsOpen = useSessionStore(selectSettingsOpen)

  const [wizardDismissed, setWizardDismissed] = useState(false)

  const wizardOpen = showWizard && !wizardDismissed

  const handleWizardOpenChange = useCallback((open: boolean) => {
    if (!open) setWizardDismissed(true)
  }, [])

  const handleWizardComplete = useCallback(() => {
    setWizardDismissed(true)
  }, [])

  return (
    <HotkeysProvider>
      <div className="min-h-screen">
        {showSkipToMain ? (
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-xl focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            {t('accessibility.skipToMain', 'Skip to main content')}
          </a>
        ) : null}
        <ErrorBoundary componentName="Header" fallback={<HeaderFallback />}>
          <Header />
        </ErrorBoundary>
        <main
          id="main-content"
          aria-label={t('accessibility.mainContent', 'Main content')}
          tabIndex={-1}
          className="pb-safe outline-none"
        >
          <ErrorBoundary componentName="MainContent">
            <Outlet />
          </ErrorBoundary>
        </main>
        {settingsOpen ? (
          <ErrorBoundary componentName="SettingsDialog">
            <Suspense fallback={null}>
              <SettingsDialog />
            </Suspense>
          </ErrorBoundary>
        ) : null}
        {wizardOpen ? (
          <Suspense fallback={null}>
            <ConnectionWizard
              open={wizardOpen}
              onOpenChange={handleWizardOpenChange}
              onComplete={handleWizardComplete}
            />
          </Suspense>
        ) : null}
        <Toaster />
        {DevTools ? (
          <Suspense fallback={null}>
            <DevTools />
          </Suspense>
        ) : null}
      </div>
    </HotkeysProvider>
  )
}
