import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MediaSegmentDto } from '@/types/jellyfin'
import { batchSaveSegments, getSegmentsById } from '@/services/segments/api'

const jellyfinFetchEmptyMock = vi.hoisted(() => vi.fn())
const jellyfinFetchJsonMock = vi.hoisted(() => vi.fn())

vi.mock('@/services/jellyfin', () => ({
  withApi: vi.fn(
    async <TResult>(
      fn: (apis: {
        api: { accessToken: string; basePath: string }
      }) => Promise<TResult>,
    ) =>
      fn({
        api: {
          accessToken: 'test-token',
          basePath: 'http://localhost:8096',
        },
      }),
  ),
}))

vi.mock('@/services/jellyfin/http', () => ({
  jellyfinFetchEmpty: jellyfinFetchEmptyMock,
  jellyfinFetchJson: jellyfinFetchJsonMock,
}))

const itemId = '6872cc2e-33a9-909b-7b2d-07ab03abcb03'

const segment = (
  id: string,
  type: MediaSegmentDto['Type'],
  start: number,
): MediaSegmentDto => ({
  Id: `48f9667b-0b42-4900-87d8-94b18122349${id}`,
  ItemId: itemId,
  Type: type,
  StartTicks: start,
  EndTicks: start + 10,
})

const primeBulkRead = async () => {
  jellyfinFetchJsonMock.mockImplementationOnce(async (request) => {
    request.onResponse?.(
      new Response(null, { status: 200, headers: { ETag: '"v1"' } }),
    )
    return []
  })
  await getSegmentsById(itemId)
}

describe('batch segment save', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('saves duplicate non-commercial types in one atomic request', async () => {
    jellyfinFetchEmptyMock.mockResolvedValue(undefined)
    await primeBulkRead()
    const existing = [segment('0', 'Intro', 0)]
    const requested = [segment('1', 'Intro', 0), segment('2', 'Intro', 20)]

    await expect(
      batchSaveSegments(itemId, existing, requested),
    ).resolves.toHaveLength(2)
    expect(jellyfinFetchEmptyMock).toHaveBeenCalledTimes(1)
    expect(jellyfinFetchEmptyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        endpoint: `MediaSegmentsApi/${itemId}`,
        headers: { 'If-Match': '"v1"' },
      }),
    )
    expect(jellyfinFetchEmptyMock.mock.calls[0][0].body).toEqual([
      expect.objectContaining({
        Type: 'Intro',
        StartTicks: 0,
        EndTicks: 100_000_000,
      }),
      expect.objectContaining({
        Type: 'Intro',
        StartTicks: 200_000_000,
        EndTicks: 300_000_000,
      }),
    ])
  })

  it('keeps duplicate Commercial segments supported', async () => {
    jellyfinFetchEmptyMock.mockResolvedValue(undefined)
    await primeBulkRead()
    const requested = [
      segment('1', 'Commercial', 0),
      segment('2', 'Commercial', 20),
    ]

    await expect(
      batchSaveSegments(itemId, [], requested),
    ).resolves.toHaveLength(2)
    expect(jellyfinFetchEmptyMock).toHaveBeenCalledTimes(1)
  })

  it('rejects a stale bulk replacement instead of overwriting newer segments', async () => {
    await primeBulkRead()
    jellyfinFetchEmptyMock.mockRejectedValue({ status: 412 })

    await expect(
      batchSaveSegments(
        itemId,
        [segment('0', 'Intro', 0)],
        [segment('1', 'Intro', 20)],
      ),
    ).resolves.toEqual([])
    expect(jellyfinFetchEmptyMock).toHaveBeenCalledTimes(1)
  })

  it('avoids bulk replacement when the provider has no unfiltered read', async () => {
    jellyfinFetchJsonMock
      .mockRejectedValueOnce({ status: 405 })
      .mockResolvedValueOnce({ Items: [segment('0', 'Intro', 0)] })
    jellyfinFetchEmptyMock.mockResolvedValue(undefined)

    await getSegmentsById(itemId)
    await batchSaveSegments(
      itemId,
      [segment('0', 'Intro', 0)],
      [segment('1', 'Intro', 20)],
    )

    expect(
      jellyfinFetchEmptyMock.mock.calls.map(([request]) => request.method),
    ).toEqual(['DELETE', 'POST'])
  })
})
