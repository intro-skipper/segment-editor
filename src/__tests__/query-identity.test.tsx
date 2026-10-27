/**
 * Server-backed queries across server and user switches, through the real
 * query hooks and options. Only the Jellyfin item API is faked; it answers as
 * whoever the credential store says is signed in when the request goes out.
 *
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  QueryClient,
  QueryClientProvider,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { Suspense, createElement } from 'react'
import type { ReactNode } from 'react'
import type { BaseItemDto } from '@/types/jellyfin'
import type * as ItemsApi from '@/services/items/api'
import {
  currentQueryIdentity,
  dropPreviousIdentities,
  useQueryIdentity,
} from '@/hooks/queries/query-identity'
import type { QueryIdentity } from '@/hooks/queries/query-identity'
import {
  albumQueryOptions,
  artistQueryOptions,
  itemsQueryOptions,
  seriesQueryOptions,
  useItem,
  useItems,
} from '@/services/items/queries'
import { collectionsKeys } from '@/services/items/query-keys'
import { segmentsQueryOptions } from '@/services/segments/queries'
import { useApiStore } from '@/stores/api-store'

const jellyfin = vi.hoisted(() => ({
  /** While set, every request waits for it before answering. */
  hold: null as Promise<void> | null,
}))

vi.mock('@/services/items/api', async (importOriginal) => {
  const { useApiStore: store } = await import('@/stores/api-store')
  const signedIn = () => {
    const { serverAddress, userId } = store.getState()
    return `${serverAddress} as ${userId ?? 'api key'}`
  }
  const answer = async (id: string): Promise<BaseItemDto> => {
    const name = signedIn()
    await jellyfin.hold
    return { Id: id, Name: name }
  }
  return {
    ...(await importOriginal<typeof ItemsApi>()),
    getItemById: vi.fn(answer),
    getItems: vi.fn(async ({ parentId }: { parentId: string }) => ({
      items: [await answer(parentId)],
      totalCount: 1,
    })),
  }
})

const { getItemById, getItems } = await import('@/services/items/api')

const SERVER_A = 'http://a.example'
const SERVER_B = 'http://b.example'
const ITEM_ID = 'item'

function signIn(serverAddress: string, userId?: string) {
  act(() =>
    useApiStore.setState({
      serverAddress,
      userId,
      apiKey: 'token',
      validAuth: true,
    }),
  )
}

/** Holds every request until the returned release is called. */
function holdRequests() {
  let release = () => {}
  jellyfin.hold = new Promise<void>((resolve) => {
    release = () => {
      jellyfin.hold = null
      resolve()
    }
  })
  return release
}

const stops: Array<() => void> = []

/** A QueryClient that drops other identities' queries, as the app's does. */
function appQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  stops.push(dropPreviousIdentities(queryClient))
  return queryClient
}

/** Renders `hook`, recording the data of every render in `seen`. */
function renderQuery<R extends { data: unknown }>(
  hook: () => R,
  queryClient = appQueryClient(),
) {
  const seen: Array<R['data']> = []
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(Suspense, { fallback: null }, children),
    )
  const view = renderHook(
    () => {
      const result = hook()
      seen.push(result.data)
      return result
    },
    { wrapper },
  )
  return { ...view, seen, queryClient }
}

afterEach(() => {
  cleanup()
  for (const stop of stops.splice(0)) stop()
  jellyfin.hold = null
  vi.mocked(getItemById).mockClear()
  vi.mocked(getItems).mockClear()
  useApiStore.setState({
    serverAddress: '',
    userId: undefined,
    apiKey: undefined,
    validAuth: false,
  })
})

describe('query identity', () => {
  it("never shows the previous server's items while the new server's load", async () => {
    signIn(SERVER_A)
    const { result, seen } = renderQuery(() => useItems({ parentId: 'lib' }))
    await waitFor(() =>
      expect(result.current.data?.items[0]?.Name).toBe(
        `${SERVER_A} as api key`,
      ),
    )

    const release = holdRequests()
    seen.length = 0
    signIn(SERVER_B)
    await waitFor(() => expect(getItems).toHaveBeenCalledTimes(2))
    expect(result.current.data).toBeUndefined()
    release()

    await waitFor(() =>
      expect(result.current.data?.items[0]?.Name).toBe(
        `${SERVER_B} as api key`,
      ),
    )
    expect(
      seen.flatMap((page) => page?.items ?? []).map((item) => item.Name),
    ).not.toContain(`${SERVER_A} as api key`)
  })

  it("loads the item afresh as another user instead of the previous user's copy", async () => {
    signIn(SERVER_A, 'alice')
    const { result, seen } = renderQuery(() => useItem(ITEM_ID))
    await waitFor(() =>
      expect(result.current.data?.Name).toBe(`${SERVER_A} as alice`),
    )

    seen.length = 0
    signIn(SERVER_A, 'bob')

    await waitFor(() =>
      expect(result.current.data?.Name).toBe(`${SERVER_A} as bob`),
    )
    expect(seen.map((item) => item?.Name)).not.toContain(`${SERVER_A} as alice`)
  })

  it('keeps each identity under its own key', async () => {
    const queryClient = new QueryClient()
    signIn(SERVER_A, 'alice')
    const alice = currentQueryIdentity()
    await queryClient.ensureQueryData(itemsQueryOptions.detail(alice, ITEM_ID))

    signIn(SERVER_A, 'bob')
    const item = await queryClient.ensureQueryData(
      itemsQueryOptions.detail(currentQueryIdentity(), ITEM_ID),
    )

    expect(item?.Name).toBe(`${SERVER_A} as bob`)
    expect(
      queryClient.getQueryData<BaseItemDto>(
        itemsQueryOptions.detail(alice, ITEM_ID).queryKey,
      )?.Name,
    ).toBe(`${SERVER_A} as alice`)
  })

  it.each([
    ['server', SERVER_B, 'alice'],
    ['user', SERVER_A, 'bob'],
  ])(
    "drops the previous identity's cached queries when the %s changes",
    async (_, serverAddress, userId) => {
      const queryClient = appQueryClient()
      signIn(SERVER_A, 'alice')
      await queryClient.ensureQueryData(
        itemsQueryOptions.detail(currentQueryIdentity(), ITEM_ID),
      )

      signIn(serverAddress, userId)

      expect(queryClient.getQueryCache().getAll()).toEqual([])
    },
  )

  it('keeps the shown page and sends nothing when the user signs out', async () => {
    signIn(SERVER_A, 'alice')
    const { result, queryClient } = renderQuery(() =>
      useSuspenseQuery(itemsQueryOptions.detail(useQueryIdentity(), ITEM_ID)),
    )
    await waitFor(() =>
      expect(result.current.data?.Name).toBe(`${SERVER_A} as alice`),
    )

    await act(async () => useApiStore.getState().clearAuth())

    expect(result.current.data?.Name).toBe(`${SERVER_A} as alice`)
    expect(getItemById).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1)
  })

  it('keeps the cache when the token changes but the server and user do not', async () => {
    const queryClient = appQueryClient()
    signIn(SERVER_A, 'alice')
    await queryClient.ensureQueryData(
      itemsQueryOptions.detail(currentQueryIdentity(), ITEM_ID),
    )

    act(() => useApiStore.setState({ apiKey: 'renewed-token' }))

    expect(queryClient.getQueryCache().getAll()).toHaveLength(1)
  })

  it('stays idle without valid auth and loads once signed in', async () => {
    act(() =>
      useApiStore.setState({ serverAddress: SERVER_A, validAuth: false }),
    )
    const { result } = renderQuery(() => useItem(ITEM_ID))

    expect(result.current.fetchStatus).toBe('idle')
    expect(getItemById).not.toHaveBeenCalled()

    signIn(SERVER_A, 'alice')

    await waitFor(() =>
      expect(result.current.data?.Name).toBe(`${SERVER_A} as alice`),
    )
  })

  it('reads what a route loader ensured, without fetching again', async () => {
    const queryClient = appQueryClient()
    signIn(SERVER_A, 'alice')
    await queryClient.ensureQueryData(
      itemsQueryOptions.detail(currentQueryIdentity(), ITEM_ID),
    )

    const { result } = renderQuery(() => useItem(ITEM_ID), queryClient)

    expect(result.current.data?.Name).toBe(`${SERVER_A} as alice`)
    expect(getItemById).toHaveBeenCalledTimes(1)
  })

  const ALICE: QueryIdentity = { serverAddress: SERVER_A, userId: 'alice' }
  const EPISODE: BaseItemDto = { Id: 'episode', SeriesId: 'series' }

  it.each([
    ['items list', () => itemsQueryOptions.list(ALICE, { parentId: 'lib' })],
    ['items detail', () => itemsQueryOptions.detail(ALICE, ITEM_ID)],
    ['series seasons', () => seriesQueryOptions.seasons(ALICE, 'series')],
    [
      'series episodes',
      () => seriesQueryOptions.episodes(ALICE, 'series', 'season'),
    ],
    [
      'adjacent episodes',
      () =>
        seriesQueryOptions.adjacentEpisodes(ALICE, EPISODE, new QueryClient()),
    ],
    ['album tracks', () => albumQueryOptions.tracks(ALICE, 'album')],
    ['artist albums', () => artistQueryOptions.albums(ALICE, 'artist')],
    ['collections', () => ({ queryKey: collectionsKeys.list(ALICE) })],
    ['segments', () => segmentsQueryOptions.list(ALICE, ITEM_ID)],
  ])('scopes the %s key to the identity', (_, options) => {
    expect(options().queryKey[0]).toEqual(ALICE)
  })
})
