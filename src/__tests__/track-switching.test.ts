// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type Hls from 'hls.js'
import type { AudioTrackInfo, SubtitleTrackInfo } from '@/services/video/tracks'
import {
  switchAudioTrack,
  switchSubtitleTrack,
} from '@/services/video/track-switching'

const getVideoStreamUrlMock = vi.hoisted(() => vi.fn())
const createPlaySessionIdMock = vi.hoisted(() => vi.fn())
const buildApiUrlMock = vi.hoisted(() => vi.fn())
const getCredentialsMock = vi.hoisted(() => vi.fn())
const getDeviceIdMock = vi.hoisted(() => vi.fn())

vi.mock('@/services/video/api', () => ({
  getVideoStreamUrl: getVideoStreamUrlMock,
}))

vi.mock('@/services/video/session', () => ({
  createPlaySessionId: createPlaySessionIdMock,
}))

vi.mock('@/services/jellyfin', () => ({
  buildApiUrl: buildApiUrlMock,
  getCredentials: getCredentialsMock,
  getDeviceId: getDeviceIdMock,
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

function createSubtitleTrack(
  index: number,
  relativeIndex: number,
): SubtitleTrackInfo {
  return {
    index,
    relativeIndex,
    language: 'eng',
    displayTitle: `Subtitle ${index}`,
    format: 'SRT',
    isExternal: true,
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

describe('switchSubtitleTrack direct play', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDeviceIdMock.mockReturnValue('device-1')
    getCredentialsMock.mockReturnValue({
      serverAddress: 'https://jellyfin.example',
      accessToken: 'token',
    })
    buildApiUrlMock.mockImplementation(({ serverAddress, endpoint, query }) => {
      const params = query ? `?${query.toString()}` : ''
      return `${serverAddress}/${endpoint}${params}`
    })
  })

  it('loads a managed external subtitle track when no TextTrack exists', async () => {
    const video = document.createElement('video')
    const textTracks: Array<TextTrack> = []
    Object.defineProperty(video, 'textTracks', {
      configurable: true,
      value: textTracks,
    })

    const appendChild = video.appendChild.bind(video)
    vi.spyOn(video, 'appendChild').mockImplementation((node) => {
      const result = appendChild(node)
      textTracks.push({ mode: 'disabled' } as TextTrack)
      window.setTimeout(() => {
        node.dispatchEvent(new Event('load'))
      }, 0)
      return result
    })

    await expect(
      switchSubtitleTrack(3, {
        strategy: 'direct',
        videoElement: video,
        itemId: 'item-1',
        subtitleTracks: [createSubtitleTrack(3, 0)],
      }),
    ).resolves.toEqual({ success: true })

    const trackElement = video.querySelector('track')
    expect(trackElement?.src).toContain(
      '/Videos/item-1/item-1/Subtitles/3/0/Stream.vtt',
    )
    expect(trackElement?.getAttribute('data-segment-editor-track')).toBe('true')
    expect(textTracks[0].mode).toBe('showing')
  })
})
