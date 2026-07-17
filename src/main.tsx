import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createBrowserHistory,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router'

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
import { installViewTransitionAbortHandler } from './lib/view-transition-error'

import './styles.css'

installVitePreloadErrorHandler()
installViewTransitionAbortHandler()

if (import.meta.env.DEV) {
  const { applyDevMockServerLogin } =
    await import('./lib/dev-mock-server-login')
  applyDevMockServerLogin()
}

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

// The app's navigation animations are defined entirely via
// `:active-view-transition-type(...)` rules in styles.css. When transition
// types are unsupported (e.g. Safari/iOS 18.0–18.1 ship startViewTransition
// without types), TanStack Router bypasses the `types` callback below and
// starts an untyped transition for every navigation — including the plugin
// boot redirect, whose aborted transition then rejects unhandled. Without
// type support none of our animations can apply, so disable view transitions
// there entirely.
const supportsViewTransitionTypes =
  typeof window !== 'undefined' &&
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('selector(:active-view-transition-type(a))')

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
  defaultViewTransition: supportsViewTransitionTypes
    ? {
        types: ({ fromLocation, toLocation, pathChanged, hashChanged }) => {
          // Skip the very first navigation (no previous location). Plugin mode
          // redirects away from its entry URL during boot, and a transition
          // started there is immediately aborted by the follow-up navigation.
          if (!fromLocation) return false

          // Skip transition for hash-only changes (e.g., anchor links)
          if (!pathChanged && hashChanged) return ['instant']

          // No transition if path didn't change
          if (!pathChanged) return false

          const from = fromLocation.pathname
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
      }
    : undefined,
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
        <QueryClientProvider client={queryClient}>
          <DesktopFallback />
        </QueryClientProvider>
      </StrictMode>,
    )
  } else {
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </StrictMode>,
    )
  }
}
