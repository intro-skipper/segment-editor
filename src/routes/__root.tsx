import { Suspense, lazy, useCallback, useState } from 'react'
import {
  Link,
  Outlet,
  createRootRouteWithContext,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Home } from 'lucide-react'
import { LazyMotion, domAnimation } from 'motion/react'

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

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'

import { useConnectionInit } from '../hooks/use-connection-init'
import { useSessionStore } from '../stores/session-store'

// Initialize i18next
import '../i18n/config'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

const loadSettingsDialog = () => import('../components/settings')
const loadConnectionWizard = () => import('../components/connection')

const SettingsDialog = lazy(() =>
  loadSettingsDialog().then((module) => ({
    default: module.SettingsDialog,
  })),
)

const ConnectionWizard = lazy(() =>
  loadConnectionWizard().then((module) => ({
    default: module.ConnectionWizard,
  })),
)

const selectSettingsOpen = (
  state: ReturnType<typeof useSessionStore.getState>,
) => state.settingsOpen

/**
 * Minimal header fallback when the main header crashes.
 * Provides basic navigation to recover from errors.
 */
function HeaderFallback() {
  const { t } = useTranslation()
  const router = useRouter()

  const handleRefresh = useCallback(() => {
    void router.invalidate()
  }, [router])

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-xl bg-background/80"
      role="banner"
    >
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

/**
 * 404 Not Found component for the root route.
 * Displays a friendly error message when a route is not found.
 */
function NotFoundComponent() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // Safe back navigation that stays within the app
  const handleGoBack = useCallback(() => {
    navigate({ to: '/' })
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
function RootComponent() {
  const { t } = useTranslation()

  // Unified connection initialization for both plugin and standalone modes
  const { showWizard } = useConnectionInit()
  const settingsOpen = useSessionStore(selectSettingsOpen)

  // Local override to allow manually closing the wizard
  const [wizardDismissed, setWizardDismissed] = useState(false)

  // Show wizard if hook says so AND user hasn't dismissed it
  const wizardOpen = showWizard && !wizardDismissed

  const handleWizardOpenChange = useCallback((open: boolean) => {
    if (!open) setWizardDismissed(true)
  }, [])

  // Handle wizard completion
  const handleWizardComplete = useCallback(() => {
    setWizardDismissed(true)
  }, [])

  return (
    <LazyMotion features={domAnimation}>
      <div className="min-h-screen">
        {/* Skip link for keyboard navigation - visible only when focused */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-xl focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          {t('accessibility.skipToMain', 'Skip to main content')}
        </a>
        {/* Header wrapped in error boundary to prevent header crashes from breaking the app */}
        <ErrorBoundary componentName="Header" fallback={<HeaderFallback />}>
          <Header />
        </ErrorBoundary>
        <main
          id="main-content"
          role="main"
          aria-label={t('accessibility.mainContent', 'Main content')}
          tabIndex={-1}
          className="pb-safe outline-none"
        >
          <ErrorBoundary componentName="MainContent">
            <Outlet />
          </ErrorBoundary>
        </main>
        {settingsOpen ? (
          <Suspense fallback={null}>
            <SettingsDialog />
          </Suspense>
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
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
      </div>
    </LazyMotion>
  )
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
})
