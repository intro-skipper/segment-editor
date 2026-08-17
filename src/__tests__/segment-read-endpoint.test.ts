/**
 * The editor reads segments from Intro-Skipper's `MediaSegmentsApi/{itemId}` endpoint, never from
 * Jellyfin's core `/MediaSegments/{itemId}`. The core endpoint shapes its response for playback:
 * Intro-Skipper's first-episode filter strips intros from season premieres, and Jellyfin hides
 * segments whose provider the library has disabled. Reading it made a saved intro on a season
 * premiere permanently invisible in the editor (segment-editor-plugin issue #16).
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
  withApi: vi.fn(async (fn: (apis: typeof mockApis) => Promise<unknown>) =>
    fn(mockApis),
  ),
}))

const ITEM_ID = '6872cc2e33a9909b7b2d07ab03abcb03'

describe('segment read endpoint', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads through the editor endpoint, not the playback-shaped core endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ Items: [], TotalRecordCount: 0 }), {
        status: 200,
      }),
    )

    await getSegmentsById(ITEM_ID)

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe(
      `http://localhost:8096/MediaSegmentsApi/${ITEM_ID}`,
    )
    expect(init?.method).toBe('GET')
    expect(init?.headers).toMatchObject({
      Authorization: 'MediaBrowser Token="test-token"',
    })
  })

  it('returns an intro saved on a season premiere, converted to UI seconds', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          Items: [
            {
              Id: '48f9667b0b42490b87d894b18122349d',
              ItemId: ITEM_ID,
              Type: 'Intro',
              StartTicks: 4186000000,
              EndTicks: 5150800000,
            },
            {
              Id: '58f9667b0b42490b87d894b18122349d',
              ItemId: ITEM_ID,
              Type: 'Outro',
              StartTicks: 34789200000,
              EndTicks: 35457600000,
            },
          ],
          TotalRecordCount: 2,
        }),
        { status: 200 },
      ),
    )

    const segments = await getSegmentsById(ITEM_ID)

    expect(segments.map((s) => s.Type)).toEqual(['Intro', 'Outro'])
    expect(segments[0]).toMatchObject({ StartTicks: 418.6, EndTicks: 515.08 })
  })
})
