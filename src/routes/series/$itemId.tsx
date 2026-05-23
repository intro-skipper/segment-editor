// @refresh reset
import { createFileRoute, notFound } from '@tanstack/react-router'
import { z } from 'zod'

import { itemsQueryOptions, seriesQueryOptions } from '@/services/items/queries'
import { SeriesPage, SeriesSkeleton } from '@/components/routes/SeriesItemRoute'

const jellyfinIdSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i,
    'Invalid series ID format',
  )

const seriesParamsSchema = z.object({
  itemId: jellyfinIdSchema,
})

export const Route = createFileRoute('/series/$itemId')({
  params: {
    parse: (params) => seriesParamsSchema.parse(params),
    stringify: (params) => params,
  },
  loader: async ({ params, context }) => {
    const { itemId } = params
    const { queryClient } = context

    await Promise.all([
      queryClient.ensureQueryData(itemsQueryOptions.detail(itemId)),
      queryClient.ensureQueryData(seriesQueryOptions.seasons(itemId)),
    ])
  },
  onError: () => {
    throw notFound()
  },
  pendingComponent: SeriesSkeleton,
  component: SeriesPage,
})
