import { createRootRouteWithContext } from '@tanstack/react-router'
import { z } from 'zod'

// Initialize i18next
import '../i18n/config'

import type { QueryClient } from '@tanstack/react-query'

import { NotFoundComponent, RootComponent } from './-root-components'

interface MyRouterContext {
  queryClient: QueryClient
}

const rootSearchSchema = z.object({
  collection: z.string().optional().catch(undefined),
})

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootComponent,
  validateSearch: rootSearchSchema,
  notFoundComponent: NotFoundComponent,
})
