// @refresh reset
import { createFileRoute, notFound } from '@tanstack/react-router'
import { z } from 'zod'

import { albumQueryOptions, itemsQueryOptions } from '@/services/items/queries'
import { AlbumPage, AlbumSkeleton } from '@/components/routes/AlbumItemRoute'

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
  loader: async ({ params, context }) => {
    const { itemId } = params
    const { queryClient } = context

    await Promise.all([
      queryClient.ensureQueryData(itemsQueryOptions.detail(itemId)),
      queryClient.ensureQueryData(albumQueryOptions.tracks(itemId)),
    ])
  },
  onError: () => {
    throw notFound()
  },
  pendingComponent: AlbumSkeleton,
  component: AlbumPage,
})
