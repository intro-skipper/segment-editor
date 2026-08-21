// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useArtworkColor } from '@/hooks/use-artwork-color'
import type * as ConstantsModule from '@/lib/constants'
import { blobCache } from '@/lib/cache-manager'
import { useAppStore } from '@/stores/app-store'

vi.mock('@/lib/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof ConstantsModule>()
  return {
    ...actual,
    CACHE_CONFIG: {
      MAX_COLOR_CACHE_SIZE: 2,
      MAX_BLOB_CACHE_SIZE: 300,
    },
  }
})

const imageInstances: Array<MockImage> = []

class MockImage {
  width = 1
  height = 1
  decoding = ''
  crossOrigin: string | null = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  loaded = false
  private currentSrc = ''

  constructor() {
    imageInstances.push(this)
  }

  get src(): string {
    return this.currentSrc
  }

  set src(value: string) {
    this.currentSrc = value
  }
}

async function completeImage(
  source: string,
  occurrence: number,
): Promise<void> {
  await waitFor(() => {
    expect(imageInstances.filter((image) => image.src === source)).toHaveLength(
      occurrence,
    )
  })

  const image = imageInstances.filter((candidate) => candidate.src === source)[
    occurrence - 1
  ]
  expect(image).toBeDefined()

  await act(async () => {
    if (image.loaded) return
    image.loaded = true
    image.onload?.()
    await Promise.resolve()
  })
}

/** The 2D-context members the artwork sampler touches. */
type CanvasSampler = Pick<CanvasRenderingContext2D, 'drawImage'> & {
  getImageData: (
    ...args: Parameters<CanvasRenderingContext2D['getImageData']>
  ) => { data: Uint8ClampedArray }
}

beforeEach(() => {
  imageInstances.length = 0
  blobCache.clear()
  useAppStore.getState().setMonochrome(false)

  vi.stubGlobal('Image', MockImage)
  // jsdom ships no ImageData, so the sampler's return is described
  // structurally rather than constructed.
  const context: CanvasSampler = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray([255, 0, 0, 255]),
    })),
  }
  // SAFETY: the artwork sampler calls only drawImage and getImageData on the
  // 2D context; nothing else on the interface is reached.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as CanvasRenderingContext2D,
  )
})

afterEach(() => {
  cleanup()
  useAppStore.getState().setMonochrome(false)
  blobCache.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useArtworkColor', () => {
  it('restarts extraction after eviction and after monochrome is disabled', async () => {
    const activeUrl = 'https://example.test/active.jpg'
    const activeBlob = 'blob:active'
    blobCache.set(activeUrl, activeBlob)

    const active = renderHook(() => useArtworkColor(activeUrl))
    await completeImage(activeBlob, 1)
    await waitFor(() => expect(active.result.current).not.toBeNull())
    const seed = active.result.current

    const firstFillerUrl = 'https://example.test/filler-1.jpg'
    const firstFillerBlob = 'blob:filler-1'
    blobCache.set(firstFillerUrl, firstFillerBlob)
    const firstFiller = renderHook(() => useArtworkColor(firstFillerUrl))
    await completeImage(firstFillerBlob, 1)
    await waitFor(() => expect(firstFiller.result.current).toBe(seed))
    firstFiller.unmount()

    const secondFillerUrl = 'https://example.test/filler-2.jpg'
    const secondFillerBlob = 'blob:filler-2'
    blobCache.set(secondFillerUrl, secondFillerBlob)
    const secondFiller = renderHook(() => useArtworkColor(secondFillerUrl))
    await completeImage(secondFillerBlob, 1)
    await completeImage(activeBlob, 2)
    await waitFor(() => expect(active.result.current).toBe(seed))
    secondFiller.unmount()

    const pendingUrls = [
      ['https://example.test/pending-1.jpg', 'blob:pending-1'],
      ['https://example.test/pending-2.jpg', 'blob:pending-2'],
    ] as const
    const pendingHooks = pendingUrls.map(([url, blobUrl]) => {
      blobCache.set(url, blobUrl)
      return renderHook(() => useArtworkColor(url))
    })

    act(() => useAppStore.getState().setMonochrome(true))
    expect(active.result.current).toBeNull()
    pendingHooks.forEach((hook) => hook.unmount())

    await completeImage(pendingUrls[0][1], 1)
    await completeImage(pendingUrls[1][1], 1)
    expect(
      imageInstances.filter((image) => image.src === activeBlob),
    ).toHaveLength(2)

    act(() => useAppStore.getState().setMonochrome(false))
    await completeImage(activeBlob, 3)
    await waitFor(() => expect(active.result.current).toBe(seed))
  })
})
