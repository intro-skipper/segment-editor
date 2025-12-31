import { useEffect } from 'react'
import {
  Link,
  Outlet,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Home } from 'lucide-react'

import Header from '../components/Header'
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
 * 404 Not Found component for the root route.
 * Displays a friendly error message when a route is not found.
 */
function NotFoundComponent() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
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
          <Button variant="outline" onClick={() => window.history.back()}>
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
  const initPluginMode = useApiStore((state) => state.initPluginMode)
  const serverAddress = useApiStore((state) => state.serverAddress)

  // Initialize plugin mode and test connection on app start
  useEffect(() => {
    // Detect and initialize plugin mode
    initPluginMode()

    // Test connection if server address is configured
    if (serverAddress) {
      testConnection()
    }
  }, [initPluginMode, serverAddress])

  return (
    <>
      <Header />
      <Outlet />
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
    </>
  )
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
})
