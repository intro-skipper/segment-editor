// @refresh reset
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { artistQueryOptions, itemsQueryOptions } from '@/services/items/queries'
import { ArtistPage, ArtistSkeleton } from '@/components/routes/ArtistItemRoute'
import { DetailRouteErrorComponent } from '../-detail-route-error-component'
import {
  assertItemFound,
  assertJellyfinCredentials,
} from '../-detail-route-loader-utils'

const jellyfinIdSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i,
    'Invalid artist ID format',
  )

const artistParamsSchema = z.object({
  itemId: jellyfinIdSchema,
})

export const Route = createFileRoute('/artist/$itemId')({
  params: {
    parse: (params) => artistParamsSchema.parse(params),
    stringify: (params) => params,
  },
  loader: async ({ params, context, abortController }) => {
    const { itemId } = params
    const { queryClient } = context

    assertJellyfinCredentials()

    const [artist] = await Promise.all([
      queryClient.ensureQueryData(itemsQueryOptions.detail(itemId)),
      queryClient.ensureQueryData(artistQueryOptions.albums(itemId)),
      import('@/components/views/ArtistView'),
    ])
    assertItemFound(artist, abortController.signal)
  },
  errorComponent: DetailRouteErrorComponent,
  pendingComponent: ArtistSkeleton,
  component: ArtistPage,
})
