/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ItemImage } from '@/components/media/ItemImage'
import { useApiStore } from '@/stores/api-store'

const BLURHASH_DATA_URL = 'data:image/png;base64,blurhash'

beforeEach(() => {
  useApiStore.setState({
    serverAddress: 'https://jellyfin.example',
    apiKey: 'api-key',
  })
  // jsdom has no canvas; the blurhash decode only needs these to hand back a data URL.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
    }),
    putImageData: () => {},
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    BLURHASH_DATA_URL,
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('keeps the blurhash under the photo once the photo has loaded', () => {
  const { container } = render(
    <ItemImage
      item={{
        Id: '0123456789abcdef0123456789abcdef',
        Name: 'Episode',
        ImageTags: { Primary: 'tag' },
        ImageBlurHashes: { Primary: { tag: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj' } },
      }}
    />,
  )

  fireEvent.load(screen.getByRole('img', { name: 'Episode' }))

  expect(
    container.querySelector(`img[src="${BLURHASH_DATA_URL}"]`),
  ).toBeTruthy()
})
