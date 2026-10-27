/**
 * The segment store's wire contract, against a fake Jellyfin at `fetch`.
 *
 * Reads must come from Intro-Skipper's unfiltered editor endpoint when it
 * exists (Jellyfin's core read hides premiere intros, and a bulk replace
 * built on it would delete them), falling back to the core read on 405.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readSegments, replaceSegments } from '@/services/segments/store'
import { useApiStore } from '@/stores/api-store'
import { ErrorCodes } from '@/lib/unified-error'
import { fakeSegmentServer, segment } from './helpers/fake-segment-server'

const ITEM_ID = '6872cc2e33a9909b7b2d07ab03abcb03'
const INTRO = segment(
  '48f9667b0b42490b87d894b18122349d',
  'Intro',
  418.6,
  515.08,
)
const OUTRO = segment(
  '58f9667b0b42490b87d894b18122349d',
  'Outro',
  3478.92,
  3545.76,
)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('segment store', () => {
  it('reads the unfiltered editor endpoint in seconds', async () => {
    const server = fakeSegmentServer({
      itemId: ITEM_ID,
      bulk: true,
      segments: [INTRO, OUTRO],
    })

    const { segments } = await readSegments(ITEM_ID)

    expect(server.requests.map((r) => r.path)).toEqual([
      `MediaSegmentsApi/${ITEM_ID}`,
    ])
    expect(segments).toMatchObject([
      { type: 'Intro', startSeconds: 418.6, endSeconds: 515.08 },
      { type: 'Outro', startSeconds: 3478.92, endSeconds: 3545.76 },
    ])
  })

  it('gives a segment read without an Id a client Id and sends it back on the bulk PUT', async () => {
    const server = fakeSegmentServer({
      itemId: ITEM_ID,
      bulk: true,
      segments: [{ type: 'Intro', startSeconds: 10, endSeconds: 20 }],
    })
    const snapshot = await readSegments(ITEM_ID)
    const id = snapshot.segments[0]?.id

    await replaceSegments(ITEM_ID, snapshot, snapshot.segments)

    expect(id).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
    )
    const put = server.requests.find((r) => r.method === 'PUT')
    expect(put?.body).toMatchObject([{ Id: id }])
  })

  it('replaces the whole set in one PUT guarded by the read ETag, in ticks', async () => {
    const server = fakeSegmentServer({
      itemId: ITEM_ID,
      bulk: true,
      segments: [INTRO],
    })
    const snapshot = await readSegments(ITEM_ID)

    await replaceSegments(ITEM_ID, snapshot, [
      { ...INTRO, startSeconds: 400 },
      OUTRO,
    ])

    const put = server.requests.find((r) => r.method === 'PUT')
    expect(server.writes()).toEqual([`PUT MediaSegmentsApi/${ITEM_ID}`])
    expect(put?.ifMatch).toBe('"v1"')
    expect(put?.body).toMatchObject([
      { Type: 'Intro', StartTicks: 4_000_000_000, EndTicks: 5_150_800_000 },
      { Type: 'Outro', StartTicks: 34_789_200_000, EndTicks: 35_457_600_000 },
    ])
  })

  it('reads the core endpoint and saves by delete-then-create for older providers', async () => {
    const server = fakeSegmentServer({
      itemId: ITEM_ID,
      bulk: false,
      segments: [INTRO],
    })

    const snapshot = await readSegments(ITEM_ID)
    await replaceSegments(ITEM_ID, snapshot, [OUTRO])

    expect(server.requests.slice(0, 2).map((r) => r.path)).toEqual([
      `MediaSegmentsApi/${ITEM_ID}`,
      `MediaSegments/${ITEM_ID}`,
    ])
    expect(server.writes()).toEqual([
      `DELETE MediaSegmentsApi/${INTRO.id}`,
      `POST MediaSegmentsApi/${ITEM_ID}`,
    ])
    expect(server.stored()).toMatchObject([{ type: 'Outro' }])
  })

  it('creates each segment as a Jellyfin DTO with its Id and item, in ticks', async () => {
    const server = fakeSegmentServer({ itemId: ITEM_ID, bulk: false })
    const snapshot = await readSegments(ITEM_ID)

    const { segments } = await replaceSegments(ITEM_ID, snapshot, [OUTRO])

    const post = server.requests.find((r) => r.method === 'POST')
    expect(post?.body).toEqual({
      Id: OUTRO.id,
      ItemId: ITEM_ID,
      Type: 'Outro',
      StartTicks: 34_789_200_000,
      EndTicks: 35_457_600_000,
    })
    expect(segments).toEqual([{ ...OUTRO, itemId: ITEM_ID }])
  })

  it('stops a delete-then-create before creating when a delete fails', async () => {
    const server = fakeSegmentServer({
      itemId: ITEM_ID,
      bulk: false,
      segments: [INTRO],
    })
    const snapshot = await readSegments(ITEM_ID)
    server.fail('DELETE', 403)

    await expect(
      replaceSegments(ITEM_ID, snapshot, [OUTRO]),
    ).rejects.toMatchObject({
      code: ErrorCodes.FORBIDDEN,
    })
    expect(server.writes()).toEqual([`DELETE MediaSegmentsApi/${INTRO.id}`])
  })

  it('rejects a failed read instead of reporting no segments', async () => {
    const server = fakeSegmentServer({
      itemId: ITEM_ID,
      bulk: true,
      segments: [INTRO],
    })
    // Once only: a fallback to the core read on any error would then succeed.
    server.fail('GET', 500, { times: 1 })

    await expect(readSegments(ITEM_ID)).rejects.toMatchObject({
      code: ErrorCodes.SERVER_ERROR,
    })
  })

  it('rejects when there are no credentials instead of reporting no segments', async () => {
    fakeSegmentServer({ itemId: ITEM_ID, bulk: true, segments: [INTRO] })
    useApiStore.setState({ serverAddress: '', apiKey: undefined })

    await expect(readSegments(ITEM_ID)).rejects.toMatchObject({
      code: ErrorCodes.API_UNAVAILABLE,
    })
  })
})
