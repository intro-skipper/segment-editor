/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import type * as ItemsApi from '@/services/items/api'
import { useApiStore } from '@/stores/api-store'

const SERIES_ID = '0123456789abcdef0123456789abcdef'
const SEASON_ID = 'fedcba9876543210fedcba9876543210'

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

type LoaderContext = Parameters<
  Extract<typeof Route.options.loader, (...args: never) => unknown>
>[0]

function runLoader(cause: LoaderContext['cause'], seasonId?: string) {
  let settled = false
  const loader = Route.options.loader
  if (typeof loader !== 'function')
    throw new Error('series route has no loader')
  const run = Promise.resolve(
    loader({
      params: { itemId: SERIES_ID },
      deps: { seasonId },
      context: { queryClient: new QueryClient() },
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

  it('holds a series opened from another series, which the router also reports as stay', async () => {
    await expectHeldUntilEpisodes(runLoader('stay'))
  })

  // A loader that waits for the held episodes never settles, so the short timeout fails it.
  it('switches seasons without waiting for their episodes', async () => {
    const { run } = runLoader('stay', SEASON_ID)
    await run
    jellyfin.releaseEpisodes()
  }, 1000)
})
