// @refresh reset
import { createFileRoute, notFound } from '@tanstack/react-router'
import { z } from 'zod'

import { itemsQueryOptions } from '@/services/items/queries'
import { segmentsQueryOptions } from '@/services/segments/queries'
import { PlayerPage, PlayerSkeleton } from '@/components/routes/PlayerItemRoute'

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
  loader: async ({ params, context, deps }) => {
    const { itemId } = params
    const { queryClient } = context

    const prefetches: Array<Promise<unknown>> = [
      queryClient.ensureQueryData(itemsQueryOptions.detail(itemId)),
    ]

    if (deps.fetchSegments) {
      prefetches.push(
        queryClient.ensureQueryData(segmentsQueryOptions.list(itemId)),
      )
    }

    await Promise.all(prefetches)
  },
  onError: () => {
    throw notFound()
  },
  pendingComponent: PlayerSkeleton,
  component: PlayerPage,
})
