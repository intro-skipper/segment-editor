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
import { isPluginMode } from './services/jellyfin/core'

import './styles.css'

// Create a new router instance

const TanStackQueryProviderContext = TanStackQueryProvider.getContext()

// Use memory history in plugin mode (iframe), browser history otherwise
const history = isPluginMode()
  ? createMemoryHistory({ initialEntries: ['/configurationpage'] })
  : createBrowserHistory()
const basePath = isPluginMode() ? '/configurationpage' : '/'
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
  defaultPreloadStaleTime: 0,
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
