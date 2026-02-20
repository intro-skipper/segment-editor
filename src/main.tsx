import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import {
  RouterProvider,
  createBrowserHistory,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router'

import * as TanStackQueryProvider from './integrations/tanstack-query/root-provider.tsx'

// Import the generated route tree
import { routeTree } from './routeTree.gen'
import {
  PLUGIN_ROUTER_BASE_PATH,
  PLUGIN_ROUTER_ENTRY,
  isPluginMode,
} from './services/jellyfin/core'

import './styles.css'

// Create a new router instance

const TanStackQueryProviderContext = TanStackQueryProvider.getContext()
const pluginMode = isPluginMode()
const pluginBuild = import.meta.env.BASE_URL.startsWith('/SegmentEditor/')

// Use memory history in plugin mode, browser history otherwise
const history = pluginMode
  ? createMemoryHistory({ initialEntries: [PLUGIN_ROUTER_ENTRY] })
  : createBrowserHistory()
const basePath = pluginMode
  ? PLUGIN_ROUTER_BASE_PATH
  : pluginBuild
    ? '/SegmentEditor'
    : '/'
const router = createRouter({
  routeTree,
  basepath: basePath,
  history: history,
  context: {
    ...TanStackQueryProviderContext,
  },
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 30_000,
  // Enable view transitions with typed navigation
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

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Render the app
const rootElement = document.getElementById('app')
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <TanStackQueryProvider.Provider {...TanStackQueryProviderContext}>
        <RouterProvider router={router} />
      </TanStackQueryProvider.Provider>
    </StrictMode>,
  )
}
