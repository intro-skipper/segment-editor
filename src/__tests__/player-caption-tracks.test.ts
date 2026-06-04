import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildNativeCaptionTracks } from '@/components/player/caption-tracks'
import type { SubtitleTrackInfo } from '@/services/video/tracks'

const getSubtitleDeliveryUrlMock = vi.hoisted(() =>
  vi.fn((itemId: string, trackIndex: number, format: string) =>
    trackIndex === 3 ? '' : `/subtitle/${itemId}/${trackIndex}.${format}`,
  ),
)

vi.mock('@/services/video/track-switching', () => ({
  getSubtitleDeliveryUrl: getSubtitleDeliveryUrlMock,
}))

function subtitleTrack(
  index: number,
  overrides: Partial<SubtitleTrackInfo> = {},
): SubtitleTrackInfo {
  return {
    index,
    relativeIndex: index,
    language: 'eng',
    displayTitle: `Subtitle ${index}`,
    format: 'SRT',
    isExternal: true,
    isDefault: index === 0,
    ...overrides,
  }
}

describe('buildNativeCaptionTracks', () => {
  beforeEach(() => {
    getSubtitleDeliveryUrlMock.mockClear()
  })

  it('does not derive native captions for HLS playback or missing item ids', () => {
    const tracks = [subtitleTrack(1)]

    expect(buildNativeCaptionTracks('hls', 'item-1', tracks)).toEqual([])
    expect(buildNativeCaptionTracks('direct', undefined, tracks)).toEqual([])
    expect(getSubtitleDeliveryUrlMock).not.toHaveBeenCalled()
  })

  it('maps direct-play subtitles to VTT caption tracks and skips unavailable urls', () => {
    const captions = buildNativeCaptionTracks('direct', 'item-1', [
      subtitleTrack(1),
      subtitleTrack(2, { language: null }),
      subtitleTrack(3),
    ])

    expect(captions).toEqual([
      {
        index: 1,
        language: 'eng',
        label: 'Subtitle 1',
        src: '/subtitle/item-1/1.vtt',
      },
      {
        index: 2,
        language: undefined,
        label: 'Subtitle 2',
        src: '/subtitle/item-1/2.vtt',
      },
    ])
    expect(getSubtitleDeliveryUrlMock).toHaveBeenCalledTimes(3)
    expect(getSubtitleDeliveryUrlMock).toHaveBeenNthCalledWith(1, 'item-1', 1, 'vtt')
    expect(getSubtitleDeliveryUrlMock).toHaveBeenNthCalledWith(2, 'item-1', 2, 'vtt')
    expect(getSubtitleDeliveryUrlMock).toHaveBeenNthCalledWith(3, 'item-1', 3, 'vtt')
  })
})
