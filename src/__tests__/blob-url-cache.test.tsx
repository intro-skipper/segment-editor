// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useBlobUrl } from '@/hooks/useBlobUrl'
import { blobCache } from '@/lib/cache-manager'

const cachedUrl = 'https://example.test/cached.jpg'
const newerUrl = 'https://example.test/newer.jpg'

beforeEach(() => {
  blobCache.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  blobCache.clear()
})

describe('useBlobUrl', () => {
  it('promotes cached blob URLs outside render', async () => {
    blobCache.set(cachedUrl, 'blob:cached')
    blobCache.set(newerUrl, 'blob:newer')

    const { result } = renderHook(() => useBlobUrl(cachedUrl))

    expect(result.current).toBe('blob:cached')

    await waitFor(() => {
      expect(Array.from(blobCache.keys()).at(-1)).toBe(cachedUrl)
    })
  })

  it('does not return a revoked blob URL after cache eviction', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise<Response>(() => {}),
    )
    blobCache.set(cachedUrl, 'blob:cached')

    const { result, rerender } = renderHook(
      ({ url }: { url: string | null }) => useBlobUrl(url),
      { initialProps: { url: cachedUrl as string | null } },
    )

    expect(result.current).toBe('blob:cached')

    await act(async () => {
      await Promise.resolve()
    })

    rerender({ url: null })
    blobCache.delete(cachedUrl)
    rerender({ url: cachedUrl })

    expect(result.current).toBe('')
  })
})
