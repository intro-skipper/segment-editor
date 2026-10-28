// @refresh reset
import { createFileRoute } from '@tanstack/react-router'
import { onlineManager } from '@tanstack/react-query'
import { z } from 'zod'

import { currentQueryIdentity } from '@/hooks/queries/query-identity'
import { itemsQueryOptions, seriesQueryOptions } from '@/services/items/queries'
import { resolveSelectedSeasonId } from '@/lib/series-utils'
import { getBestImageUrl } from '@/services/video/api'
import { getSeedColor } from '@/hooks/use-artwork-color'
import { selectMonochrome, useAppStore } from '@/stores/app-store'
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

/** How long entering a series waits for the artwork tint before showing the page untinted. */
const TINT_WAIT_MS = 300

const seriesSearchSchema = z.object({
  seasonId: jellyfinIdSchema.optional().catch(undefined),
})

export const Route = createFileRoute('/series/$itemId')({
  params: {
    parse: (params) => seriesParamsSchema.parse(params),
    stringify: (params) => params,
  },
  validateSearch: seriesSearchSchema,
  loaderDeps: ({ search }) => ({ seasonId: search.seasonId }),
  loader: async ({ params, deps, context, cause, abortController }) => {
    const { itemId } = params
    const { queryClient } = context

    assertJellyfinCredentials()
    const identity = currentQueryIdentity()

    const [series, seasons] = await Promise.all([
      queryClient.ensureQueryData(itemsQueryOptions.detail(identity, itemId)),
      queryClient.ensureQueryData(seriesQueryOptions.seasons(identity, itemId)),
      import('@/components/views/SeriesView'),
    ])
    assertItemFound(series, abortController.signal)

    const seasonId = resolveSelectedSeasonId(seasons, deps.seasonId)
    // Cached episodes, even stale, resolve at once; a failure falls through to the list's error state.
    const episodes =
      series.Id && seasonId
        ? queryClient
            .ensureQueryData(
              seriesQueryOptions.episodes(identity, series.Id, seasonId),
            )
            .catch(() => undefined)
        : undefined

    // Opening a series waits for the shown season and, briefly, the artwork
    // tint, so the page arrives complete in one transition (pendingComponent
    // covers a slow server). A season tab navigates within the same series
    // with an explicit seasonId; that only warms the season, so the tab
    // responds at once. Series-to-series navigation is also 'stay', hence the
    // seasonId check rather than cause alone.
    const switchingSeason = cause === 'stay' && deps.seasonId !== undefined
    if (!switchingSeason) {
      const imageUrl = selectMonochrome(useAppStore.getState())
        ? undefined
        : getBestImageUrl(series, 300)
      const tint =
        imageUrl &&
        Promise.race([
          getSeedColor(imageUrl),
          new Promise((resolve) => setTimeout(resolve, TINT_WAIT_MS)),
        ])
      // Offline, the episodes query pauses without settling; let the page render.
      await Promise.all([onlineManager.isOnline() && episodes, tint])
    }
  },
  errorComponent: DetailRouteErrorComponent,
  pendingComponent: SeriesSkeleton,
  component: SeriesPage,
})
