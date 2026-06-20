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
  language = 'eng',
): AudioTrackInfo {
  return {
    index,
    relativeIndex,
    language,
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

interface TestNativeAudioTrack {
  enabled: boolean
  language: string
}

function createNativeAudioTracks(languages: Array<string>): {
  list: Array<TestNativeAudioTrack>
  tracks: Array<TestNativeAudioTrack>
} {
  const tracks = languages.map((language, index) => ({
    enabled: index === 0,
    language,
  }))
  return { list: tracks, tracks }
}

describe('switchAudioTrack native and HLS runtime selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enables the direct-play native audio track by relative index', async () => {
    const video = document.createElement('video')
    const { list, tracks } = createNativeAudioTracks(['eng', 'jpn'])
    Object.defineProperty(video, 'audioTracks', {
      configurable: true,
      value: list,
    })
    const onReloadHls = vi.fn<() => Promise<void>>()

    await expect(
      switchAudioTrack(7, {
        strategy: 'direct',
        videoElement: video,
        audioTracks: [createAudioTrack(5, 0), createAudioTrack(7, 1, 'jpn')],
        itemId: 'item-native',
        onReloadHls,
      }),
    ).resolves.toEqual({ success: true })

    expect(tracks.map((track) => track.enabled)).toEqual([false, true])
    expect(onReloadHls).not.toHaveBeenCalled()
  })

  it('uses native audio track language matching when relative index is invalid', async () => {
    const video = document.createElement('video')
    const { list, tracks } = createNativeAudioTracks(['eng', 'jpn'])
    Object.defineProperty(video, 'audioTracks', {
      configurable: true,
      value: list,
    })
    const onReloadHls = vi.fn<() => Promise<void>>()

    await expect(
      switchAudioTrack(7, {
        strategy: 'direct',
        videoElement: video,
        audioTracks: [createAudioTrack(5, 0), createAudioTrack(7, 99, 'jpn')],
        itemId: 'item-native',
        onReloadHls,
      }),
    ).resolves.toEqual({ success: true })

    expect(tracks.map((track) => track.enabled)).toEqual([false, true])
    expect(onReloadHls).not.toHaveBeenCalled()
  })

  it('uses native audio track position fallback when relative index and language do not match', async () => {
    const video = document.createElement('video')
    const { list, tracks } = createNativeAudioTracks(['spa', 'fra'])
    Object.defineProperty(video, 'audioTracks', {
      configurable: true,
      value: list,
    })
    const onReloadHls = vi.fn<() => Promise<void>>()

    await expect(
      switchAudioTrack(7, {
        strategy: 'direct',
        videoElement: video,
        audioTracks: [
          createAudioTrack(5, 0, 'eng'),
          createAudioTrack(7, 99, 'jpn'),
        ],
        itemId: 'item-native',
        onReloadHls,
      }),
    ).resolves.toEqual({ success: true })

    expect(tracks.map((track) => track.enabled)).toEqual([false, true])
    expect(onReloadHls).not.toHaveBeenCalled()
  })

  it('skips a native audio track with unknown language when matching by language', async () => {
    const video = document.createElement('video')
    // The HTML AudioTrack API reports an empty language string when unknown; it
    // must not match every requested language and shadow the real match.
    const { list, tracks } = createNativeAudioTracks(['', 'jpn'])
    Object.defineProperty(video, 'audioTracks', {
      configurable: true,
      value: list,
    })
    const onReloadHls = vi.fn<() => Promise<void>>()

    await expect(
      switchAudioTrack(7, {
        strategy: 'direct',
        videoElement: video,
        audioTracks: [createAudioTrack(5, 0, 'eng'), createAudioTrack(7, 99, 'jpn')],
        itemId: 'item-native',
        onReloadHls,
      }),
    ).resolves.toEqual({ success: true })

    expect(tracks.map((track) => track.enabled)).toEqual([false, true])
    expect(onReloadHls).not.toHaveBeenCalled()
  })

  it('falls back to HLS reload when no native audio track matches', async () => {
    createPlaySessionIdMock.mockReturnValue('play-session-1')
    getVideoStreamUrlMock.mockReturnValue('https://example.com/hls.m3u8')
    const video = document.createElement('video')
    const { list, tracks } = createNativeAudioTracks(['spa', 'fra'])
    Object.defineProperty(video, 'audioTracks', {
      configurable: true,
      value: list,
    })
    const onReloadHls = vi.fn<() => Promise<void>>()

    await expect(
      switchAudioTrack(9, {
        strategy: 'direct',
        videoElement: video,
        audioTracks: [
          createAudioTrack(5, 99, 'eng'),
          createAudioTrack(7, 99, 'jpn'),
          createAudioTrack(9, 99, 'kor'),
        ],
        itemId: 'item-native',
        onReloadHls,
      }),
    ).resolves.toEqual({ success: true, reloadRequired: true })

    expect(tracks.map((track) => track.enabled)).toEqual([true, false])
    expect(onReloadHls).toHaveBeenCalledWith({
      url: 'https://example.com/hls.m3u8',
      playSessionId: 'play-session-1',
    })
  })

  it('uses an HLS manifest audio track language match without reloading', async () => {
    const hlsInstance = {
      audioTracks: [
        { lang: 'eng', name: 'English' },
        { lang: 'jpn', name: 'Japanese' },
      ],
      audioTrack: 0,
    } as unknown as Hls
    const onReloadHls = vi.fn<() => Promise<void>>()

    await expect(
      switchAudioTrack(7, {
        strategy: 'hls',
        videoElement: document.createElement('video'),
        hlsInstance,
        audioTracks: [createAudioTrack(5, 0), createAudioTrack(7, 1, 'jpn')],
        itemId: 'item-hls',
        onReloadHls,
      }),
    ).resolves.toEqual({ success: true })

    expect(hlsInstance.audioTrack).toBe(1)
    expect(onReloadHls).not.toHaveBeenCalled()
  })
})

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

  it('returns api_unsupported when direct-play fallback lacks item id', async () => {
    const result = await switchAudioTrack(5, {
      strategy: 'direct',
      videoElement: {} as HTMLVideoElement,
      audioTracks: [createAudioTrack(5, 0)],
      onReloadHls: vi.fn<() => Promise<void>>(),
    })

    expect(getVideoStreamUrlMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: false,
      error: {
        type: 'api_unsupported',
        message:
          'Audio track switching requires transcoding in this browser. Item ID not available.',
        trackIndex: 5,
      },
    })
  })

  it('returns api_unsupported when hls reload-required path lacks reload callback', async () => {
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
    })

    expect(getVideoStreamUrlMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: false,
      error: {
        type: 'api_unsupported',
        message: 'HLS reload callback not provided',
        trackIndex: 7,
      },
    })
  })

  it('returns network_error when reload URL generation fails', async () => {
    getVideoStreamUrlMock.mockReturnValue('')
    const onReloadHls = vi.fn<() => Promise<void>>()

    const result = await switchAudioTrack(5, {
      strategy: 'direct',
      videoElement: {} as HTMLVideoElement,
      audioTracks: [createAudioTrack(5, 0)],
      itemId: 'item-direct',
      onReloadHls,
    })

    expect(onReloadHls).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: false,
      error: {
        type: 'network_error',
        message: 'Failed to generate HLS URL for audio track switching',
        trackIndex: 5,
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

  it('hides existing text tracks and disables HLS subtitles when subtitles are turned off', async () => {
    const video = document.createElement('video')
    const textTracks = [
      { mode: 'showing' },
      { mode: 'showing' },
    ] as Array<TextTrack>
    Object.defineProperty(video, 'textTracks', {
      configurable: true,
      value: textTracks,
    })
    const hlsInstance = { subtitleTrack: 1 } as unknown as Hls

    await expect(
      switchSubtitleTrack(null, {
        strategy: 'hls',
        videoElement: video,
        hlsInstance,
      }),
    ).resolves.toEqual({ success: true, jassubAction: 'dispose' })

    expect(textTracks.map((track) => track.mode)).toEqual(['hidden', 'hidden'])
    expect(hlsInstance.subtitleTrack).toBe(-1)
  })

  it('hides existing text tracks before initializing ASS subtitles', async () => {
    const video = document.createElement('video')
    const textTracks = [
      { mode: 'showing' },
      { mode: 'disabled' },
    ] as Array<TextTrack>
    Object.defineProperty(video, 'textTracks', {
      configurable: true,
      value: textTracks,
    })
    const hlsInstance = { subtitleTrack: 1 } as unknown as Hls
    const assTrack = {
      ...createSubtitleTrack(4, 0),
      format: 'ASS',
    }

    await expect(
      switchSubtitleTrack(4, {
        strategy: 'hls',
        videoElement: video,
        hlsInstance,
        subtitleTracks: [assTrack],
      }),
    ).resolves.toEqual({
      success: true,
      jassubAction: 'initialize',
      track: assTrack,
    })

    expect(textTracks.map((track) => track.mode)).toEqual(['hidden', 'hidden'])
    expect(hlsInstance.subtitleTrack).toBe(-1)
  })
})
