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
  getPluginServerAddress,
  isJellyfinDesktopClient,
  isPluginMode,
} from './services/jellyfin/core'

import './styles.css'

// Desktop client fallback
// When running as a plugin inside Jellyfin Desktop or Jellyfin Media Player,
// the embedded browser lacks features needed by this app. Show a link to the
// standalone browser version instead.
function renderDesktopFallback(container: HTMLElement): void {
  const serverAddress = getPluginServerAddress()
  const editorUrl = serverAddress
    ? `${serverAddress.replace(/\/+$/, '')}/SegmentEditor`
    : '/SegmentEditor'

  const wrapper = document.createElement('div')
  Object.assign(wrapper.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '2rem',
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif",
    background: '#09090b',
    color: '#fafafa',
  })

  const card = document.createElement('div')
  Object.assign(card.style, {
    maxWidth: '28rem',
    width: '100%',
    textAlign: 'center',
    border: '1px solid #27272a',
    borderRadius: '0.75rem',
    padding: '2.5rem 2rem',
    background: '#18181b',
  })

  const heading = document.createElement('h1')
  Object.assign(heading.style, {
    margin: '0 0 0.75rem',
    fontSize: '1.25rem',
    fontWeight: '600',
  })
  heading.textContent = 'Segment Editor'

  const description = document.createElement('p')
  Object.assign(description.style, {
    margin: '0 0 1.5rem',
    fontSize: '0.875rem',
    color: '#a1a1aa',
    lineHeight: '1.5',
  })
  description.textContent =
    'This app is not supported in the Jellyfin desktop client. Please open it in your browser instead.'

  const link = document.createElement('a')
  link.href = editorUrl
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.textContent = 'Open in Browser'
  Object.assign(link.style, {
    display: 'inline-block',
    padding: '0.5rem 1.25rem',
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#fafafa',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.375rem',
    textDecoration: 'none',
    cursor: 'pointer',
    marginBottom: '1rem',
  })

  const urlDisplay = document.createElement('div')
  Object.assign(urlDisplay.style, {
    marginTop: '0.25rem',
    padding: '0.625rem 1rem',
    background: '#09090b',
    border: '1px solid #27272a',
    borderRadius: '0.375rem',
    fontFamily:
      "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
    fontSize: '0.8125rem',
    color: '#a1a1aa',
    wordBreak: 'break-all',
    userSelect: 'all',
    cursor: 'text',
  })
  urlDisplay.textContent = editorUrl

  card.append(heading, description, link, urlDisplay)
  wrapper.append(card)
  container.append(wrapper)
}

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
  if (pluginMode && isJellyfinDesktopClient()) {
    renderDesktopFallback(rootElement)
  } else {
    const root = ReactDOM.createRoot(rootElement)
    root.render(
      <StrictMode>
        <TanStackQueryProvider.Provider {...TanStackQueryProviderContext}>
          <RouterProvider router={router} />
        </TanStackQueryProvider.Provider>
      </StrictMode>,
    )
  }
}
