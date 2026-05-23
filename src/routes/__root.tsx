import { createRootRouteWithContext } from '@tanstack/react-router'

// Initialize i18next
import '../i18n/config'

import type { QueryClient } from '@tanstack/react-query'

import { NotFoundComponent, RootComponent } from './-root-components'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
})
