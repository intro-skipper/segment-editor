import { afterEach, describe, expect, it, vi } from 'vitest'
import { jellyfinFetchEmpty, jellyfinFetchJson } from '@/services/jellyfin/http'
import { AppError, ErrorCodes } from '@/lib/unified-error'

const baseOptions = {
  accessToken: 'secret-token',
  baseUrl: 'http://localhost:8096',
  endpoint: 'MediaSegmentsApi/item-id',
} as const

describe('jellyfin http helper', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('sends authenticated JSON requests without ApiKey query params', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ Id: 'segment-id' }), { status: 200 }),
      )

    await jellyfinFetchJson({
      ...baseOptions,
      body: { Name: 'Intro' },
      method: 'POST',
      query: new URLSearchParams({ providerId: 'IntroSkipper' }),
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe(
      'http://localhost:8096/MediaSegmentsApi/item-id?providerId=IntroSkipper',
    )
    expect(String(url)).not.toContain('ApiKey')
    expect(init?.headers).toMatchObject({
      Authorization: 'MediaBrowser Token="secret-token"',
      'Content-Type': 'application/json',
    })
    expect(init?.body).toBe(JSON.stringify({ Name: 'Intro' }))
  })

  it('maps non-2xx responses through AppError status mapping', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 403 }),
    )

    await expect(
      jellyfinFetchEmpty({ ...baseOptions, method: 'DELETE' }),
    ).rejects.toMatchObject({ code: ErrorCodes.FORBIDDEN, status: 403 })
  })

  it('normalizes network failures through recoverable AppError', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new TypeError('fetch failed'),
    )

    await expect(
      jellyfinFetchEmpty({ ...baseOptions, method: 'DELETE' }),
    ).rejects.toMatchObject({
      code: ErrorCodes.NETWORK_ERROR,
      recoverable: true,
    })
  })

  it('preserves caller abort as cancellation', async () => {
    const controller = new AbortController()
    controller.abort(new DOMException('Aborted', 'AbortError'))
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new DOMException('Aborted', 'AbortError'),
    )

    await expect(
      jellyfinFetchEmpty({
        ...baseOptions,
        method: 'DELETE',
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('maps helper-created timeout distinctly from caller abort', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal as AbortSignal | undefined
          signal?.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          })
        }),
    )

    const request = jellyfinFetchEmpty({
      ...baseOptions,
      method: 'DELETE',
      timeout: 100,
    })
    const assertion = expect(request).rejects.toMatchObject({
      code: ErrorCodes.TIMEOUT,
    })
    await vi.advanceTimersByTimeAsync(100)

    await assertion
  })

  it('parses JSON responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ Id: 'segment-id' }), { status: 200 }),
    )

    await expect(
      jellyfinFetchJson<{ Id: string }>({ ...baseOptions, method: 'POST' }),
    ).resolves.toEqual({ Id: 'segment-id' })
  })

  it('accepts empty and 204 responses for empty-response calls', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    )

    await expect(
      jellyfinFetchEmpty({ ...baseOptions, method: 'DELETE' }),
    ).resolves.toBeUndefined()
  })

  it('rejects empty bodies when JSON is expected', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 200 }),
    )

    await expect(
      jellyfinFetchJson({ ...baseOptions, method: 'POST' }),
    ).rejects.toBeInstanceOf(AppError)
  })

  it('rejects 204 responses when JSON is expected', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    )

    await expect(
      jellyfinFetchJson({ ...baseOptions, method: 'POST' }),
    ).rejects.toBeInstanceOf(AppError)
  })

  it('rejects invalid JSON when JSON is expected', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not-json', { status: 200 }),
    )

    await expect(
      jellyfinFetchJson({ ...baseOptions, method: 'POST' }),
    ).rejects.toBeInstanceOf(AppError)
  })
})
