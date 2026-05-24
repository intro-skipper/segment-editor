// @refresh reset
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { albumQueryOptions, itemsQueryOptions } from '@/services/items/queries'
import { AlbumPage, AlbumSkeleton } from '@/components/routes/AlbumItemRoute'
import {
  DetailRouteErrorComponent,
  assertItemFound,
  assertJellyfinCredentials,
} from '../-detail-route-utils'

const jellyfinIdSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i,
    'Invalid album ID format',
  )

const albumParamsSchema = z.object({
  itemId: jellyfinIdSchema,
})

export const Route = createFileRoute('/album/$itemId')({
  params: {
    parse: (params) => albumParamsSchema.parse(params),
    stringify: (params) => params,
  },
  loader: async ({ params, context, abortController }) => {
    const { itemId } = params
    const { queryClient } = context

    assertJellyfinCredentials()

    const album = await queryClient.ensureQueryData(
      itemsQueryOptions.detail(itemId),
    )
    assertItemFound(album, abortController.signal)

    await queryClient.ensureQueryData(albumQueryOptions.tracks(itemId))
  },
  errorComponent: DetailRouteErrorComponent,
  pendingComponent: AlbumSkeleton,
  component: AlbumPage,
})
