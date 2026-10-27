/**
 * The segment edit session against a fake Jellyfin at `fetch`: what the
 * draft holds, when it counts as unsaved, and what a save leaves behind.
 *
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import type * as Notifications from '@/lib/notifications'
import { useSegmentEditSession } from '@/services/segments/edit-session'
import { fakeSegmentServer, segment } from './helpers/fake-segment-server'

const showErrorMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof Notifications>()),
  showError: showErrorMock,
}))

const ITEM_ID = '6872cc2e-33a9-909b-7b2d-07ab03abcb03'
const OTHER_ITEM_ID = '7872cc2e-33a9-909b-7b2d-07ab03abcb03'
const RECAP = segment('38f9667b-0b42-4900-87d8-94b181223490', 'Recap', 0, 30)
const INTRO = segment('48f9667b-0b42-4900-87d8-94b181223490', 'Intro', 60, 90)
const OUTRO = segment(
  '58f9667b-0b42-4900-87d8-94b181223490',
  'Outro',
  1200,
  1260,
)

function renderSession(itemId = ITEM_ID) {
  // Mutation retry matches the app's QueryClient (main.tsx).
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: 1 } },
  })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  const view = renderHook(
    ({ id }) => useSegmentEditSession(id, { enabled: true }),
    { wrapper, initialProps: { id: itemId } },
  )
  return { ...view, queryClient }
}

async function renderLoadedSession() {
  const view = renderSession()
  await waitFor(() => expect(view.result.current.isLoading).toBe(false))
  return view
}

/** Refetches the item's segments the way a focus or reconnect would. */
async function refetch(queryClient: QueryClient) {
  await act(() => queryClient.refetchQueries())
}

const types = (segments: Array<{ Type?: unknown }>) =>
  segments.map((s) => s.Type)

const count = (server: ReturnType<typeof fakeSegmentServer>, method: string) =>
  server.requests.filter((r) => r.method === method).length

afterEach(() => {
  vi.restoreAllMocks()
  showErrorMock.mockClear()
})

describe('segment edit session', () => {
  it('lists the server segments by start and starts clean', async () => {
    fakeSegmentServer({ itemId: ITEM_ID, bulk: true, segments: [OUTRO, RECAP] })
    const { result } = await renderLoadedSession()

    expect(types(result.current.segments)).toEqual(['Recap', 'Outro'])
    expect(result.current.isDirty).toBe(false)
  })

  it('is dirty after an edit and clean again once the edit is undone', async () => {
    fakeSegmentServer({ itemId: ITEM_ID, bulk: true, segments: [INTRO] })
    const { result } = await renderLoadedSession()

    act(() => result.current.update({ id: INTRO.Id }, { EndTicks: 95 }))
    expect(result.current.isDirty).toBe(true)

    act(() => result.current.update({ id: INTRO.Id }, { EndTicks: 90 }))
    expect(result.current.isDirty).toBe(false)
  })

  it('does not count a reordering of same-start segments as an edit', async () => {
    const long = segment(
      '68f9667b-0b42-4900-87d8-94b181223490',
      'Intro',
      0,
      100,
    )
    const short = segment(
      '78f9667b-0b42-4900-87d8-94b181223490',
      'Recap',
      0,
      50,
    )
    fakeSegmentServer({ itemId: ITEM_ID, bulk: true, segments: [long, short] })
    const { result } = await renderLoadedSession()

    act(() => result.current.update({ id: short.Id }, { EndTicks: 60 }))
    act(() => result.current.update({ id: short.Id }, { EndTicks: 50 }))

    expect(types(result.current.segments)).toEqual(['Recap', 'Intro'])
    expect(result.current.isDirty).toBe(false)
  })

  it('keeps the edited segment active as it re-sorts', async () => {
    fakeSegmentServer({ itemId: ITEM_ID, bulk: true, segments: [RECAP, INTRO] })
    const { result } = await renderLoadedSession()

    act(() =>
      result.current.update(
        { id: RECAP.Id },
        { StartTicks: 100, EndTicks: 120 },
      ),
    )

    expect(types(result.current.segments)).toEqual(['Intro', 'Recap'])
    expect(result.current.activeIndex).toBe(1)
  })

  it('removes the targeted segment after edits re-sorted the list', async () => {
    fakeSegmentServer({
      itemId: ITEM_ID,
      bulk: true,
      segments: [RECAP, INTRO, OUTRO],
    })
    const { result } = await renderLoadedSession()

    act(() =>
      result.current.update({ id: OUTRO.Id }, { StartTicks: 10, EndTicks: 20 }),
    )
    act(() => result.current.remove({ id: INTRO.Id }))

    expect(types(result.current.segments)).toEqual(['Recap', 'Outro'])
  })

  it('saves the draft, then follows the server again', async () => {
    const server = fakeSegmentServer({
      itemId: ITEM_ID,
      bulk: true,
      segments: [INTRO],
    })
    const { result, queryClient } = await renderLoadedSession()

    act(() => result.current.create({ type: 'Outro', start: 1200, end: 1260 }))
    await act(() => result.current.save())

    expect(types(server.stored())).toEqual(['Intro', 'Outro'])
    expect(result.current.isDirty).toBe(false)

    server.changeElsewhere([RECAP])
    await refetch(queryClient)
    expect(types(result.current.segments)).toEqual(['Recap'])
  })

  it('keeps the draft when the server rejects the save, without replaying it', async () => {
    const server = fakeSegmentServer({
      itemId: ITEM_ID,
      bulk: true,
      segments: [INTRO],
    })
    const { result } = await renderLoadedSession()
    server.fail('PUT', 400)

    act(() => result.current.remove({ id: INTRO.Id }))
    await act(() => result.current.save())

    expect(result.current.segments).toEqual([])
    expect(result.current.isDirty).toBe(true)
    expect(count(server, 'PUT')).toBe(1)
    expect(types(server.stored())).toEqual(['Intro'])
    expect(showErrorMock).toHaveBeenCalledWith(
      'Save segments failed',
      'Request failed',
    )
  })

  it('reports a conflict, keeps the draft, and overwrites on the next save', async () => {
    const server = fakeSegmentServer({
      itemId: ITEM_ID,
      bulk: true,
      segments: [INTRO],
    })
    const { result } = await renderLoadedSession()

    act(() => result.current.create({ type: 'Outro', start: 1200, end: 1260 }))
    server.changeElsewhere([RECAP])
    await act(() => result.current.save())

    expect(showErrorMock).toHaveBeenCalledWith(
      'Save segments failed',
      expect.stringContaining('changed on the server'),
    )
    expect(types(result.current.segments)).toEqual(['Intro', 'Outro'])
    expect(types(server.stored())).toEqual(['Recap'])

    await act(() => result.current.save())
    expect(types(server.stored())).toEqual(['Intro', 'Outro'])
    expect(result.current.isDirty).toBe(false)
  })

  it('reports a conflict for a change made elsewhere even after a refetch mid-edit', async () => {
    const server = fakeSegmentServer({
      itemId: ITEM_ID,
      bulk: true,
      segments: [INTRO],
    })
    const { result, queryClient } = await renderLoadedSession()

    act(() => result.current.create({ type: 'Outro', start: 1200, end: 1260 }))
    server.changeElsewhere([RECAP])
    await refetch(queryClient)
    await act(() => result.current.save())

    expect(showErrorMock).toHaveBeenCalledWith(
      'Save segments failed',
      expect.stringContaining('changed on the server'),
    )
    expect(types(server.stored())).toEqual(['Recap'])
  })

  it('reports a partial delete-then-create and finishes it on the next save', async () => {
    const server = fakeSegmentServer({
      itemId: ITEM_ID,
      bulk: false,
      segments: [RECAP],
    })
    const { result } = await renderLoadedSession()
    server.fail('POST', 400, { after: 1, times: 1 })

    act(() => result.current.importSegments([INTRO, OUTRO], 'replace'))
    await act(() => result.current.save())

    expect(showErrorMock).toHaveBeenCalledWith(
      'Save segments failed',
      expect.stringContaining('Only 2 of 3'),
    )
    expect(result.current.isDirty).toBe(true)

    await act(() => result.current.save())
    expect(server.stored()).toMatchObject([
      { Type: 'Intro', StartTicks: 60, EndTicks: 90 },
      { Type: 'Outro', StartTicks: 1200, EndTicks: 1260 },
    ])
  })

  it('keeps edits made while a save is in flight', async () => {
    const server = fakeSegmentServer({
      itemId: ITEM_ID,
      bulk: true,
      segments: [INTRO],
    })
    const { result } = await renderLoadedSession()
    const release = server.hold('PUT')

    act(() => result.current.create({ type: 'Outro', start: 1200, end: 1260 }))
    let saved: Promise<void> = Promise.resolve()
    act(() => {
      saved = result.current.save()
    })
    act(() => result.current.create({ type: 'Recap', start: 0, end: 30 }))
    release()
    await act(() => saved)

    expect(types(server.stored())).toEqual(['Intro', 'Outro'])
    expect(types(result.current.segments)).toEqual(['Recap', 'Intro', 'Outro'])
    expect(result.current.isDirty).toBe(true)
  })

  it('saves edits made during a save on top of what it wrote', async () => {
    const server = fakeSegmentServer({
      itemId: ITEM_ID,
      bulk: true,
      segments: [INTRO],
    })
    const { result } = await renderLoadedSession()
    const release = server.hold('PUT')

    act(() => result.current.create({ type: 'Outro', start: 1200, end: 1260 }))
    let saved: Promise<void> = Promise.resolve()
    act(() => {
      saved = result.current.save()
    })
    act(() => result.current.create({ type: 'Recap', start: 0, end: 30 }))
    release()
    await act(() => saved)
    await act(() => result.current.save())

    expect(showErrorMock).not.toHaveBeenCalled()
    expect(types(server.stored())).toEqual(['Recap', 'Intro', 'Outro'])
  })

  it('stays unsaved during a save even when edits return to the server set', async () => {
    const server = fakeSegmentServer({
      itemId: ITEM_ID,
      bulk: true,
      segments: [INTRO],
    })
    const { result } = await renderLoadedSession()
    const release = server.hold('PUT')

    act(() => result.current.remove({ id: INTRO.Id }))
    let saved: Promise<void> = Promise.resolve()
    act(() => {
      saved = result.current.save()
    })
    await waitFor(() => expect(result.current.isSaving).toBe(true))
    act(() => result.current.importSegments([INTRO], 'replace'))

    expect(result.current.isDirty).toBe(true)
    release()
    await act(() => saved)
  })

  it("keeps the next item's conflict guard when a save fails after switching items", async () => {
    const server = fakeSegmentServer({
      itemId: ITEM_ID,
      bulk: true,
      segments: [INTRO],
    })
    const { result, rerender } = await renderLoadedSession()
    const release = server.hold('PUT')
    server.fail('PUT', 400, { times: 1 })

    act(() => result.current.create({ type: 'Outro', start: 1200, end: 1260 }))
    let saved: Promise<void> = Promise.resolve()
    act(() => {
      saved = result.current.save()
    })
    rerender({ id: OTHER_ITEM_ID })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    act(() => result.current.create({ type: 'Recap', start: 0, end: 30 }))
    release()
    await act(() => saved)
    showErrorMock.mockClear()

    server.changeElsewhere([OUTRO])
    await act(() => result.current.save())

    expect(showErrorMock).toHaveBeenCalledWith(
      'Save segments failed',
      expect.stringContaining('changed on the server'),
    )
    expect(types(server.stored())).toEqual(['Outro'])
  })

  it('ignores a second save while one is in flight', async () => {
    const server = fakeSegmentServer({
      itemId: ITEM_ID,
      bulk: true,
      segments: [INTRO],
    })
    const { result } = await renderLoadedSession()
    const release = server.hold('PUT')

    act(() => result.current.create({ type: 'Outro', start: 1200, end: 1260 }))
    let saved: Promise<void> = Promise.resolve()
    act(() => {
      saved = result.current.save()
    })
    await waitFor(() => expect(result.current.isSaving).toBe(true))
    await act(() => result.current.save())
    release()
    await act(() => saved)

    expect(count(server, 'PUT')).toBe(1)
    expect(showErrorMock).not.toHaveBeenCalled()
  })

  it('only adds segments from a draft started before the server set loaded', async () => {
    const server = fakeSegmentServer({
      itemId: ITEM_ID,
      bulk: true,
      segments: [INTRO],
    })
    const release = server.hold('GET')
    const { result } = renderSession()

    act(() => result.current.create({ type: 'Outro', start: 1200, end: 1260 }))
    release()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(() => result.current.save())

    expect(server.writes()).toEqual([`POST MediaSegmentsApi/${ITEM_ID}`])
    expect(types(server.stored())).toEqual(['Intro', 'Outro'])
  })

  it('drops the draft when the item changes', async () => {
    fakeSegmentServer({ itemId: ITEM_ID, bulk: true, segments: [INTRO] })
    const { result, rerender } = await renderLoadedSession()

    act(() => result.current.create({ type: 'Outro', start: 1200, end: 1260 }))
    rerender({ id: OTHER_ITEM_ID })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(types(result.current.segments)).toEqual(['Intro'])
    expect(result.current.isDirty).toBe(false)
  })
})
