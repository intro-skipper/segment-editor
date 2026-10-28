/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  QueryClient,
  QueryObserver,
  onlineManager,
} from '@tanstack/react-query'
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import type * as ItemsApi from '@/services/items/api'
import { useApiStore } from '@/stores/api-store'

const SERIES_ID = '0123456789abcdef0123456789abcdef'
const SEASON_ID = 'fedcba9876543210fedcba9876543210'
const OTHER_SERIES_ID = 'abcdef0123456789abcdef0123456789'

const jellyfin = vi.hoisted(() => ({
  /** Answers the pending episodes request. */
  releaseEpisodes: (): void => {},
}))

vi.mock('@/services/items/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ItemsApi>()),
  getItemById: vi.fn(async (id: string) => ({ Id: id, Type: 'Series' })),
  getSeasons: vi.fn(async () => [{ Id: SEASON_ID, IndexNumber: 1 }]),
  getEpisodes: vi.fn(
    () =>
      new Promise((resolve) => {
        jellyfin.releaseEpisodes = () => resolve([])
      }),
  ),
}))

const { getEpisodes } = await import('@/services/items/api')
const { Route } = await import('@/routes/series/$itemId')
const { itemsQueryOptions, seriesQueryOptions } =
  await import('@/services/items/queries')
const { currentQueryIdentity } = await import('@/hooks/queries/query-identity')
const { routeTree } = await import('@/routeTree.gen')

type LoaderContext = Parameters<
  Extract<typeof Route.options.loader, { handler: unknown }>['handler']
>[0]

function runLoader(
  cause: LoaderContext['cause'],
  seasonId?: string,
  queryClient = new QueryClient(),
) {
  let settled = false
  const loader = Route.options.loader
  if (typeof loader !== 'object') throw new Error('series route has no loader')
  const run = Promise.resolve(
    loader.handler({
      params: { itemId: SERIES_ID },
      deps: { seasonId },
      context: { queryClient },
      cause,
      abortController: new AbortController(),
    } as LoaderContext),
  ).then(() => {
    settled = true
  })
  return { run, isSettled: () => settled }
}

beforeEach(() => {
  vi.clearAllMocks()
  useApiStore.setState({
    serverAddress: 'https://jellyfin.example',
    apiKey: 'api-key',
  })
})

async function expectHeldUntilEpisodes(load: ReturnType<typeof runLoader>) {
  await vi.waitFor(() => expect(getEpisodes).toHaveBeenCalled())
  expect(load.isSettled()).toBe(false)

  jellyfin.releaseEpisodes()
  await load.run
  expect(load.isSettled()).toBe(true)
}

describe('series route loader', () => {
  it('holds entering the page until the shown season has loaded', async () => {
    await expectHeldUntilEpisodes(runLoader('enter'))
  })

  it('opens a series while offline instead of waiting on a paused episodes query', async () => {
    const queryClient = new QueryClient()
    const identity = currentQueryIdentity()
    queryClient.setQueryData(
      itemsQueryOptions.detail(identity, SERIES_ID).queryKey,
      { Id: SERIES_ID, Type: 'Series' },
    )
    queryClient.setQueryData(
      seriesQueryOptions.seasons(identity, SERIES_ID).queryKey,
      [{ Id: SEASON_ID, IndexNumber: 1 }],
    )
    onlineManager.setOnline(false)
    onTestFinished(() => onlineManager.setOnline(true))

    const { run, isSettled } = runLoader('enter', undefined, queryClient)
    await run
    expect(isSettled()).toBe(true)
  }, 1000)

  it('stops waiting for episodes when the connection drops mid-load', async () => {
    onTestFinished(() => onlineManager.setOnline(true))
    const { run, isSettled } = runLoader('enter')
    await vi.waitFor(() => expect(getEpisodes).toHaveBeenCalled())

    onlineManager.setOnline(false)
    await run
    expect(isSettled()).toBe(true)
    jellyfin.releaseEpisodes()
  }, 1000)

  it('holds a series opened from another series, which the router also reports as stay', async () => {
    await expectHeldUntilEpisodes(runLoader('stay'))
  })

  it('holds returning to a series through history, even with a seasonId', async () => {
    await expectHeldUntilEpisodes(runLoader('stay', SEASON_ID))
  })

  // A loader that waits for the held episodes never settles, so the short timeout fails it.
  it('switches seasons on the shown series without waiting for their episodes', async () => {
    const queryClient = new QueryClient()
    // The mounted series page observes its detail query.
    const shownPage = new QueryObserver(
      queryClient,
      itemsQueryOptions.detail(currentQueryIdentity(), SERIES_ID),
    ).subscribe(() => {})
    onTestFinished(shownPage)

    const { run } = runLoader('stay', SEASON_ID, queryClient)
    await run
    jellyfin.releaseEpisodes()
  }, 1000)

  it('reloads a series the router kept before showing it again', async () => {
    const queryClient = new QueryClient()
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({
        initialEntries: [`/series/${SERIES_ID}`],
      }),
      context: { queryClient },
    })
    const answerEpisodes = async (navigation: Promise<void>, call: number) => {
      await vi.waitFor(() => expect(getEpisodes).toHaveBeenCalledTimes(call))
      jellyfin.releaseEpisodes()
      await navigation
    }
    await answerEpisodes(router.load(), 1)
    await answerEpisodes(
      router.navigate({
        to: '/series/$itemId',
        params: { itemId: OTHER_SERIES_ID },
      }),
      2,
    )
    // The router keeps the first series until the next navigation, which can
    // come after Query has collected the episodes it showed.
    queryClient.removeQueries({
      queryKey: seriesQueryOptions.episodes(
        currentQueryIdentity(),
        SERIES_ID,
        SEASON_ID,
      ).queryKey,
    })

    let shown = false
    const back = router
      .navigate({ to: '/series/$itemId', params: { itemId: SERIES_ID } })
      .then(() => {
        shown = true
      })
    await vi.waitFor(() => expect(getEpisodes).toHaveBeenCalledTimes(3))
    expect(shown).toBe(false)
    jellyfin.releaseEpisodes()
    await back
  })
})
