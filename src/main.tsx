import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient } from '@tanstack/react-query'
import {
  RouterProvider,
  createBrowserHistory,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router'

import * as TanStackQueryProvider from './integrations/tanstack-query/root-provider.tsx'
import {
  QUERY_GC_TIMES,
  QUERY_STALE_TIMES,
} from './hooks/queries/query-constants'
import {
  getRetryDelay,
  shouldRetryQuery,
} from './hooks/queries/query-error-handling'

import { routeTree } from './routeTree.gen'
import {
  APP_BASE_ROUTE,
  PLUGIN_ROUTER_BASE_PATH,
  PLUGIN_ROUTER_ENTRY,
  isJellyfinDesktopClient,
  isPluginMode,
} from './services/jellyfin/core'
import { DesktopFallback } from './components/DesktopFallback'
import { installVitePreloadErrorHandler } from './lib/vite-preload-error'

import './styles.css'

installVitePreloadErrorHandler()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
      retryDelay: getRetryDelay,
      staleTime: QUERY_STALE_TIMES.MEDIUM,
      gcTime: QUERY_GC_TIMES.MEDIUM,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
      retryDelay: getRetryDelay,
    },
  },
})
const routerContext = { queryClient }
const pluginMode = isPluginMode()
const pluginBuild = import.meta.env.BASE_URL.startsWith(`/${APP_BASE_ROUTE}/`)

const history = pluginMode
  ? createMemoryHistory({ initialEntries: [PLUGIN_ROUTER_ENTRY] })
  : createBrowserHistory()
const basePath = pluginMode
  ? PLUGIN_ROUTER_BASE_PATH
  : pluginBuild
    ? `/${APP_BASE_ROUTE}`
    : '/'
const router = createRouter({
  routeTree,
  basepath: basePath,
  history: history,
  context: routerContext,
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultStructuralSharing: true,
  // Route loaders delegate data freshness to TanStack Query via ensureQueryData.
  // Keep Router preloads immediately stale so Query invalidation/staleTime remain
  // the single source of truth instead of Router's default 30s preload cache.
  defaultPreloadStaleTime: 0,
  defaultViewTransition: {
    types: ({ fromLocation, toLocation, pathChanged, hashChanged }) => {
      // Skip transition for hash-only changes (e.g., anchor links)
      if (!pathChanged && hashChanged) return ['instant']

      // No transition if path didn't change
      if (!pathChanged) return false

      const from = fromLocation?.pathname ?? ''
      const to = toLocation.pathname

      // Determine navigation direction based on route depth
      const fromDepth = from.split('/').filter(Boolean).length
      const toDepth = to.split('/').filter(Boolean).length

      // Special case: navigating to player
      if (to.includes('/player/')) return ['to-player']

      // Forward navigation (drilling down)
      if (toDepth > fromDepth) return ['forward']

      // Back navigation (going up)
      if (toDepth < fromDepth) return ['back']

      // Same depth - use forward as default
      return ['forward']
    },
  },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('segment-editor-root')
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement)

  if (pluginMode && isJellyfinDesktopClient()) {
    root.render(
      <StrictMode>
        <TanStackQueryProvider.Provider queryClient={queryClient}>
          <DesktopFallback />
        </TanStackQueryProvider.Provider>
      </StrictMode>,
    )
  } else {
    root.render(
      <StrictMode>
        <TanStackQueryProvider.Provider queryClient={queryClient}>
          <RouterProvider router={router} />
        </TanStackQueryProvider.Provider>
      </StrictMode>,
    )
  }
}
