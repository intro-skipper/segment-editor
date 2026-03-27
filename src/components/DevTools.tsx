import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'

const DEVTOOLS_CONFIG = { position: 'bottom-right' as const }

const DEVTOOLS_PLUGINS = [
  {
    name: 'Tanstack Router',
    render: <TanStackRouterDevtoolsPanel />,
  },
  TanStackQueryDevtools,
]

export function DevTools() {
  return (
    <TanStackDevtools config={DEVTOOLS_CONFIG} plugins={DEVTOOLS_PLUGINS} />
  )
}
