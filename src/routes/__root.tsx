import { useCallback, useEffect } from 'react'
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

import Header from '../components/Header'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Toaster } from '../components/ui/sonner'
import { SettingsDialog } from '../components/settings/SettingsDialog'
import { Button } from '../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'

import { useApiStore } from '../stores/api-store'
import { testConnection } from '../services/jellyfin/client'

// Initialize i18next
import '../i18n/config'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

/**
 * Minimal header fallback when the main header crashes.
 * Provides basic navigation to recover from errors.
 */
function HeaderFallback() {
  const { t } = useTranslation()
  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-xl bg-background/80"
      role="banner"
    >
      <nav className="px-4 py-4 sm:px-6" role="navigation">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="text-xl font-bold">
            {t('app.name', 'Segment Editor')}
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.reload()}
          >
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
  const router = useRouter()

  // Safe back navigation that stays within the app
  const handleGoBack = useCallback(() => {
    // Check if there's router history to go back to
    // If router history length > 1, we have internal navigation history
    if (router.history.length > 1) {
      router.history.back()
    } else {
      // No internal history - navigate to home instead of leaving the app
      navigate({ to: '/' })
    }
  }, [router.history, navigate])

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
 * - Tests server connection on startup
 * - Initializes plugin mode detection
 * - Renders global UI elements (Header, Settings, Toaster)
 */
function RootComponent() {
  const { t } = useTranslation()
  const serverAddress = useApiStore((state) => state.serverAddress)

  // Test connection on app start if server address is configured
  // Uses AbortController to prevent state updates after unmount
  useEffect(() => {
    if (!serverAddress) return

    const controller = new AbortController()
    testConnection({ signal: controller.signal })

    return () => controller.abort()
  }, [serverAddress])

  return (
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
      <SettingsDialog />
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
  )
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
})
