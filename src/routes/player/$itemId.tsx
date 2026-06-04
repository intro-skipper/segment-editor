// @refresh reset
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { itemsQueryOptions } from '@/services/items/queries'
import { segmentsQueryOptions } from '@/services/segments/queries'
import { PlayerPage, PlayerSkeleton } from '@/components/routes/PlayerItemRoute'
import { DetailRouteErrorComponent } from '../-detail-route-error-component'
import {
  assertItemFound,
  assertJellyfinCredentials,
} from '../-detail-route-loader-utils'

const jellyfinIdSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i,
    'Invalid item ID format',
  )

const playerParamsSchema = z.object({
  itemId: jellyfinIdSchema,
})

const playerSearchSchema = z.object({
  fetchSegments: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => {
      if (val === undefined) return true
      if (typeof val === 'boolean') return val
      return val === 'true'
    }),
})

export const Route = createFileRoute('/player/$itemId')({
  params: {
    parse: (params) => playerParamsSchema.parse(params),
    stringify: (params) => params,
  },
  validateSearch: playerSearchSchema,
  loaderDeps: ({ search }) => ({ fetchSegments: search.fetchSegments }),
  loader: async ({ params, context, deps, abortController }) => {
    const { itemId } = params
    const { queryClient } = context

    assertJellyfinCredentials()

    const segmentsPromise = deps.fetchSegments
      ? queryClient.ensureQueryData(segmentsQueryOptions.list(itemId))
      : undefined
    void segmentsPromise?.catch(() => undefined)
    const playerEditorModulePromise = import('@/components/player/PlayerEditor')
    void playerEditorModulePromise.catch(() => undefined)

    const item = await queryClient.ensureQueryData(
      itemsQueryOptions.detail(itemId),
    )
    assertItemFound(item, abortController.signal)

    await Promise.all([segmentsPromise, playerEditorModulePromise])
  },
  errorComponent: DetailRouteErrorComponent,
  pendingComponent: PlayerSkeleton,
  component: PlayerPage,
})
