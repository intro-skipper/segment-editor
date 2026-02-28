import { beforeEach, describe, expect, it, vi } from 'vitest'

import type Hls from 'hls.js'
import type { AudioTrackInfo } from '@/services/video/tracks'
import { switchAudioTrack } from '@/services/video/track-switching'

const getVideoStreamUrlMock = vi.hoisted(() => vi.fn())

vi.mock('@/services/video/api', () => ({
  getVideoStreamUrl: getVideoStreamUrlMock,
}))

function createAudioTrack(
  index: number,
  relativeIndex: number,
): AudioTrackInfo {
  return {
    index,
    relativeIndex,
    language: 'eng',
    displayTitle: `Track ${index}`,
    codec: 'aac',
    channels: 2,
    isDefault: relativeIndex === 0,
  }
}

describe('switchAudioTrack async reload failures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVideoStreamUrlMock.mockReturnValue('https://example.com/hls.m3u8')
  })

  it('returns unknown_error when direct-play fallback reload rejects', async () => {
    const onReloadHls = vi
      .fn<(newUrl: string) => Promise<void>>()
      .mockRejectedValue(new Error('reload failed'))

    const result = await switchAudioTrack(5, {
      strategy: 'direct',
      videoElement: {} as HTMLVideoElement,
      audioTracks: [createAudioTrack(5, 0)],
      itemId: 'item-direct',
      onReloadHls,
    })

    expect(onReloadHls).toHaveBeenCalledWith('https://example.com/hls.m3u8')
    expect(result).toEqual({
      success: false,
      error: {
        type: 'unknown_error',
        message: 'reload failed',
        trackIndex: 5,
      },
    })
  })

  it('returns unknown_error when hls reload-required callback rejects', async () => {
    const onReloadHls = vi
      .fn<(newUrl: string) => Promise<void>>()
      .mockRejectedValue(new Error('hls reload failed'))

    const hlsInstance = {
      audioTracks: [] as Array<{ lang?: string; name?: string }>,
      audioTrack: 0,
    } as unknown as Hls

    const result = await switchAudioTrack(7, {
      strategy: 'hls',
      videoElement: {} as HTMLVideoElement,
      hlsInstance,
      audioTracks: [createAudioTrack(7, 0)],
      itemId: 'item-hls',
      onReloadHls,
    })

    expect(onReloadHls).toHaveBeenCalledWith('https://example.com/hls.m3u8')
    expect(result).toEqual({
      success: false,
      error: {
        type: 'unknown_error',
        message: 'hls reload failed',
        trackIndex: 7,
      },
    })
  })
})
