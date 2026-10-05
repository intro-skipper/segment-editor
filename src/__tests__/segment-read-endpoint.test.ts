/**
 * The editor prefers Intro-Skipper's unfiltered `/MediaSegmentsApi/{itemId}`
 * and falls back to Jellyfin's core `/MediaSegments/{itemId}` for older
 * providers that answer 405.
 *
 * Commit 3a3de4e pointed this read at Intro-Skipper's `MediaSegmentsApi/{itemId}` to escape the
 * playback filtering that hides premiere intros (segment-editor-plugin issue #16). No released
 * plugin serves a GET there, so it answered 405 and the editor loaded nothing (issue #17). The
 * unfiltered read returns as Phase 1 of docs/plans/plugin-api-integration.md, behind the Phase 0
 * capability probe and parsing the bare array that endpoint actually returns.
 *
 * These pin both endpoint behaviors and the tick conversion so a bulk save
 * cannot accidentally replace segments hidden by the core playback read.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSegmentsById } from '@/services/segments/api'

const mockApis = {
  api: {
    accessToken: 'test-token',
    basePath: 'http://localhost:8096',
  },
}

vi.mock('@/services/jellyfin', () => ({
  withApi: vi.fn(
    async <TResult>(fn: (apis: typeof mockApis) => Promise<TResult>) =>
      fn(mockApis),
  ),
}))

const ITEM_ID = '6872cc2e33a9909b7b2d07ab03abcb03'
const CORE_URL = `http://localhost:8096/MediaSegments/${ITEM_ID}`
const EDITOR_URL = `http://localhost:8096/MediaSegmentsApi/${ITEM_ID}`

const PREMIERE_INTRO = {
  Id: '48f9667b0b42490b87d894b18122349d',
  ItemId: ITEM_ID,
  Type: 'Intro',
  StartTicks: 4186000000,
  EndTicks: 5150800000,
}

const OUTRO = {
  Id: '58f9667b0b42490b87d894b18122349d',
  ItemId: ITEM_ID,
  Type: 'Outro',
  StartTicks: 34789200000,
  EndTicks: 35457600000,
}

const segmentsResponse = (segments: Array<unknown>) =>
  new Response(
    JSON.stringify({ Items: segments, TotalRecordCount: segments.length }),
    { status: 200 },
  )

const editorSegmentsResponse = (segments: Array<unknown>) =>
  new Response(JSON.stringify(segments), { status: 200 })

describe('segment read endpoint', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads the unfiltered editor endpoint when available', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => editorSegmentsResponse([]))

    await getSegmentsById(ITEM_ID)

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      EDITOR_URL,
    ])
    const [, init] = fetchMock.mock.calls[0]
    expect(init?.method).toBe('GET')
    expect(init?.headers).toMatchObject({
      Authorization: 'MediaBrowser Token="test-token"',
    })
  })

  it('falls back to the core endpoint for providers without an editor read', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => new Response(null, { status: 405 }))
      .mockImplementationOnce(async () => segmentsResponse([]))

    await getSegmentsById(ITEM_ID)

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      EDITOR_URL,
      CORE_URL,
    ])
  })

  it('converts every segment to UI seconds and preserves order', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      editorSegmentsResponse([PREMIERE_INTRO, OUTRO]),
    )

    const segments = await getSegmentsById(ITEM_ID)

    expect(segments.map((s) => s.Type)).toEqual(['Intro', 'Outro'])
    expect(segments[0]).toMatchObject({ StartTicks: 418.6, EndTicks: 515.08 })
    expect(segments[1]).toMatchObject({
      StartTicks: 3478.92,
      EndTicks: 3545.76,
    })
  })

  it('returns an empty list when the response carries no Items', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      editorSegmentsResponse([]),
    )

    await expect(getSegmentsById(ITEM_ID)).resolves.toEqual([])
  })

  it('surfaces a failed read instead of reporting no segments', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(null, { status: 500 }),
    )

    await expect(getSegmentsById(ITEM_ID)).rejects.toThrow()
  })
})
