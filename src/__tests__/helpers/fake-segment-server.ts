import { vi } from 'vitest'
import type { MediaSegmentDto } from '@/types/jellyfin'
import { useApiStore } from '@/stores/api-store'

const BASE_URL = 'http://localhost:8096'
const TICKS_PER_SECOND = 10_000_000

type Method = 'GET' | 'PUT' | 'POST' | 'DELETE'

export interface RecordedRequest {
  method: Method
  /** Path without the server base, e.g. `MediaSegmentsApi/<itemId>` */
  path: string
  ifMatch: string | null
  body: unknown
}

/** A segment in UI seconds, stored by the fake in ticks like the server. */
export const segment = (
  id: string,
  type: MediaSegmentDto['Type'],
  startSeconds: number,
  endSeconds: number,
): MediaSegmentDto & { Id: string } => ({
  Id: id,
  Type: type,
  StartTicks: startSeconds,
  EndTicks: endSeconds,
})

const toTicks = (s: MediaSegmentDto): MediaSegmentDto => ({
  ...s,
  StartTicks: (s.StartTicks ?? 0) * TICKS_PER_SECOND,
  EndTicks: (s.EndTicks ?? 0) * TICKS_PER_SECOND,
})

const toSeconds = (s: MediaSegmentDto): MediaSegmentDto => ({
  ...s,
  StartTicks: (s.StartTicks ?? 0) / TICKS_PER_SECOND,
  EndTicks: (s.EndTicks ?? 0) / TICKS_PER_SECOND,
})

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), { status: 200, ...init })

/**
 * Jellyfin with Intro-Skipper behind a `fetch` spy, holding one item's
 * segments. `bulk: true` serves the editor read with an ETag and the atomic
 * PUT; `bulk: false` answers 405 there like older providers, which then save
 * by delete-then-create. Logs in through the real credential store.
 */
export function fakeSegmentServer({
  itemId,
  bulk,
  segments = [],
}: {
  itemId: string
  bulk: boolean
  segments?: Array<MediaSegmentDto>
}) {
  let stored = segments.map((s) => toTicks({ ...s, ItemId: itemId }))
  let version = 1
  const requests: Array<RecordedRequest> = []
  const failures: Array<{
    method: Method
    status: number
    after: number
    times: number
  }> = []
  const holds = new Map<Method, Promise<void>>()

  const respond = (
    method: Method,
    path: string,
    body: unknown,
    ifMatch: string | null,
  ): Response => {
    const failure = failures.find((f) => f.method === method && f.times > 0)
    if (failure) {
      if (failure.after > 0) failure.after--
      else {
        failure.times--
        return new Response(null, { status: failure.status })
      }
    }

    const [endpoint, id] = path.split('/')
    if (method === 'GET' && endpoint === 'MediaSegments' && id === itemId) {
      return json({ Items: stored, TotalRecordCount: stored.length })
    }
    if (endpoint !== 'MediaSegmentsApi')
      return new Response(null, { status: 404 })
    if (!bulk && (method === 'GET' || method === 'PUT')) {
      return new Response(null, { status: 405 })
    }

    switch (method) {
      case 'GET':
        return json(stored, { headers: { ETag: `"v${version}"` } })
      case 'PUT':
        if (ifMatch !== `"v${version}"`)
          return new Response(null, { status: 412 })
        stored = (body as Array<MediaSegmentDto>).map((s) => ({ ...s }))
        version++
        return json(stored, { headers: { ETag: `"v${version}"` } })
      case 'POST':
        stored = [...stored, body as MediaSegmentDto]
        return new Response(null, { status: 204 })
      case 'DELETE':
        stored = stored.filter((s) => s.Id !== id)
        return new Response(null, { status: 204 })
    }
  }

  useApiStore.setState({
    serverAddress: BASE_URL,
    apiKey: 'test-token',
    validAuth: true,
  })
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const method = (init?.method ?? 'GET') as Method
    const path = url.pathname.replace(/^\//, '')
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined
    const headers = new Headers(init?.headers)
    requests.push({ method, path, ifMatch: headers.get('If-Match'), body })
    await holds.get(method)
    return respond(method, path, body, headers.get('If-Match'))
  })

  return {
    requests,
    /** Requests other than reads, in order, as `METHOD path`. */
    writes: () =>
      requests
        .filter((r) => r.method !== 'GET')
        .map((r) => `${r.method} ${r.path}`),
    /** What the server holds, in UI seconds and start order. */
    stored: () =>
      stored
        .map(toSeconds)
        .toSorted((a, b) => (a.StartTicks ?? 0) - (b.StartTicks ?? 0)),
    /** Another client changed the item: new segments, new ETag. */
    changeElsewhere: (next: Array<MediaSegmentDto>) => {
      stored = next.map((s) => toTicks({ ...s, ItemId: itemId }))
      version++
    },
    /** Answers `times` `method` requests with `status`, after letting `after` through. */
    fail: (
      method: Method,
      status: number,
      { after = 0, times = Number.POSITIVE_INFINITY } = {},
    ) => {
      failures.push({ method, status, after, times })
    },
    /** Holds every `method` request until the returned release is called. */
    hold: (method: Method) => {
      let release = () => {}
      holds.set(
        method,
        new Promise<void>((resolve) => {
          release = () => {
            holds.delete(method)
            resolve()
          }
        }),
      )
      return release
    },
  }
}
