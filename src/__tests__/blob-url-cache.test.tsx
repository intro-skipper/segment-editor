// @vitest-environment jsdom

import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useBlobUrl } from '@/hooks/useBlobUrl'
import { blobCache } from '@/lib/cache-manager'

const cachedUrl = 'https://example.test/cached.jpg'
const newerUrl = 'https://example.test/newer.jpg'

beforeEach(() => {
  blobCache.clear()
})

afterEach(() => {
  cleanup()
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
})
