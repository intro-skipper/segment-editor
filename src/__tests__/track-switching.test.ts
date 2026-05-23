import { beforeEach, describe, expect, it, vi } from 'vitest'

import type Hls from 'hls.js'
import type { AudioTrackInfo } from '@/services/video/tracks'
import { switchAudioTrack } from '@/services/video/track-switching'

const getVideoStreamUrlMock = vi.hoisted(() => vi.fn())
const createPlaySessionIdMock = vi.hoisted(() => vi.fn())

vi.mock('@/services/video/api', () => ({
  getVideoStreamUrl: getVideoStreamUrlMock,
}))

vi.mock('@/services/video/session', () => ({
  createPlaySessionId: createPlaySessionIdMock,
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
    createPlaySessionIdMock.mockReturnValue('play-session-1')
    getVideoStreamUrlMock.mockReturnValue('https://example.com/hls.m3u8')
  })

  it('returns unknown_error when direct-play fallback reload rejects', async () => {
    const onReloadHls = vi
      .fn<(reload: { url: string; playSessionId: string }) => Promise<void>>()
      .mockRejectedValue(new Error('reload failed'))

    const result = await switchAudioTrack(5, {
      strategy: 'direct',
      videoElement: {} as HTMLVideoElement,
      audioTracks: [createAudioTrack(5, 0)],
      itemId: 'item-direct',
      mediaSourceId: 'media-source-direct',
      onReloadHls,
    })

    expect(getVideoStreamUrlMock).toHaveBeenCalledWith(
      {
        itemId: 'item-direct',
        mediaSourceId: 'media-source-direct',
        playSessionId: 'play-session-1',
      },
      5,
    )
    expect(onReloadHls).toHaveBeenCalledWith({
      url: 'https://example.com/hls.m3u8',
      playSessionId: 'play-session-1',
    })
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
      .fn<(reload: { url: string; playSessionId: string }) => Promise<void>>()
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
      mediaSourceId: 'media-source-hls',
      onReloadHls,
    })

    expect(getVideoStreamUrlMock).toHaveBeenCalledWith(
      {
        itemId: 'item-hls',
        mediaSourceId: 'media-source-hls',
        playSessionId: 'play-session-1',
      },
      7,
    )
    expect(onReloadHls).toHaveBeenCalledWith({
      url: 'https://example.com/hls.m3u8',
      playSessionId: 'play-session-1',
    })
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
