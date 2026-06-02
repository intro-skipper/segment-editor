// @refresh reset
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { itemsQueryOptions, seriesQueryOptions } from '@/services/items/queries'
import { SeriesPage, SeriesSkeleton } from '@/components/routes/SeriesItemRoute'
import { DetailRouteErrorComponent } from '../-detail-route-error-component'
import {
  assertItemFound,
  assertJellyfinCredentials,
} from '../-detail-route-loader-utils'

const jellyfinIdSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i,
    'Invalid series ID format',
  )

const seriesParamsSchema = z.object({
  itemId: jellyfinIdSchema,
})

const seriesSearchSchema = z.object({
  seasonId: jellyfinIdSchema.optional().catch(undefined),
})

export const Route = createFileRoute('/series/$itemId')({
  params: {
    parse: (params) => seriesParamsSchema.parse(params),
    stringify: (params) => params,
  },
  validateSearch: seriesSearchSchema,
  loader: async ({ params, context, abortController }) => {
    const { itemId } = params
    const { queryClient } = context

    assertJellyfinCredentials()

    const [series] = await Promise.all([
      queryClient.ensureQueryData(itemsQueryOptions.detail(itemId)),
      queryClient.ensureQueryData(seriesQueryOptions.seasons(itemId)),
    ])
    assertItemFound(series, abortController.signal)
  },
  errorComponent: DetailRouteErrorComponent,
  pendingComponent: SeriesSkeleton,
  component: SeriesPage,
})
