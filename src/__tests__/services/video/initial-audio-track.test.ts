// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AudioTrackInfo } from '@/services/video/tracks'
import {
  applyInitialAudioTrack,
  switchAudioTrack,
} from '@/services/video/track-switching'

const getVideoStreamUrlMock = vi.hoisted(() => vi.fn())
const createPlaySessionIdMock = vi.hoisted(() => vi.fn())

vi.mock('@/services/video/api', () => ({
  getVideoStreamUrl: getVideoStreamUrlMock,
}))

vi.mock('@/services/video/session', () => ({
  createPlaySessionId: createPlaySessionIdMock,
}))

vi.mock('@/services/jellyfin', () => ({
  buildApiUrl: vi.fn(),
  getCredentials: vi.fn(),
  getDeviceId: vi.fn(),
}))

// jsdom has no MediaCapabilities and canPlayType() returns '', which would
// make every codec look undecodable. Resolve decodability from the
// direct-play list instead so the native-switch paths stay testable.
vi.mock('@/services/video/compatibility', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@/services/video/compatibility')>()
  return {
    ...original,
    isCodecSupported: vi.fn(async (codec: string) =>
      original.isAudioTrackDirectPlayable(codec),
    ),
  }
})

interface TestNativeAudioTrack {
  enabled: boolean
  language: string
}

type TestNativeAudioTrackList = Array<TestNativeAudioTrack> & {
  addEventListener?: (type: string, listener: () => void) => void
  removeEventListener?: (type: string, listener: () => void) => void
}

function createAudioTrack(
  index: number,
  relativeIndex: number,
  overrides: Partial<AudioTrackInfo> = {},
): AudioTrackInfo {
  return {
    index,
    relativeIndex,
    language: 'eng',
    displayTitle: `Track ${index}`,
    codec: 'aac',
    channels: 2,
    isDefault: relativeIndex === 0,
    ...overrides,
  }
}

function createVideoWithNativeTracks(
  list: TestNativeAudioTrackList,
): HTMLVideoElement {
  const video = document.createElement('video')
  Object.defineProperty(video, 'audioTracks', {
    configurable: true,
    value: list,
  })
  return video
}

function createNativeTrackList(
  languages: Array<string>,
): TestNativeAudioTrackList {
  return languages.map((language, index) => ({
    enabled: index === 0,
    language,
  }))
}

describe('applyInitialAudioTrack', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createPlaySessionIdMock.mockReturnValue('play-session-1')
    getVideoStreamUrlMock.mockReturnValue('https://example.com/hls.m3u8')
  })

  it('enables the matching native track when playback starts on a non-default track', async () => {
    const nativeTracks = createNativeTrackList(['eng', 'jpn'])
    const onReloadHls = vi.fn<() => Promise<void>>()

    await expect(
      applyInitialAudioTrack(7, {
        strategy: 'direct',
        videoElement: createVideoWithNativeTracks(nativeTracks),
        audioTracks: [
          createAudioTrack(5, 0),
          createAudioTrack(7, 1, { language: 'jpn' }),
        ],
        itemId: 'item-native',
        onReloadHls,
        nativeTrackTimeoutMs: 0,
      }),
    ).resolves.toEqual({ success: true })

    expect(nativeTracks.map((track) => track.enabled)).toEqual([false, true])
    expect(onReloadHls).not.toHaveBeenCalled()
  })

  it('leaves the container default track untouched', async () => {
    const nativeTracks = createNativeTrackList(['eng', 'jpn'])
    const onReloadHls = vi.fn<() => Promise<void>>()

    await expect(
      applyInitialAudioTrack(7, {
        strategy: 'direct',
        videoElement: createVideoWithNativeTracks(nativeTracks),
        audioTracks: [
          createAudioTrack(5, 0, { isDefault: false }),
          createAudioTrack(7, 1, { language: 'jpn', isDefault: true }),
        ],
        itemId: 'item-native',
        onReloadHls,
        nativeTrackTimeoutMs: 0,
      }),
    ).resolves.toEqual({ success: true })

    expect(nativeTracks.map((track) => track.enabled)).toEqual([true, false])
    expect(onReloadHls).not.toHaveBeenCalled()
  })

  it('waits for the native track list to populate before enabling', async () => {
    const listeners: Array<() => void> = []
    const nativeTracks: TestNativeAudioTrackList = createNativeTrackList([
      'eng',
    ])
    nativeTracks.addEventListener = (_type, listener) => {
      listeners.push(listener)
    }
    nativeTracks.removeEventListener = () => {}
    const onReloadHls = vi.fn<() => Promise<void>>()

    const pending = applyInitialAudioTrack(7, {
      strategy: 'direct',
      videoElement: createVideoWithNativeTracks(nativeTracks),
      audioTracks: [
        createAudioTrack(5, 0),
        createAudioTrack(7, 1, { language: 'jpn' }),
      ],
      itemId: 'item-native',
      onReloadHls,
      nativeTrackTimeoutMs: 5000,
    })

    await Promise.resolve()
    nativeTracks.push({ enabled: false, language: 'jpn' })
    listeners.forEach((listener) => {
      listener()
    })

    await expect(pending).resolves.toEqual({ success: true })
    expect(nativeTracks.map((track) => track.enabled)).toEqual([false, true])
    expect(onReloadHls).not.toHaveBeenCalled()
  })

  it('falls back to an HLS reload when the native list stays empty', async () => {
    const nativeTracks = createNativeTrackList([])
    const onReloadHls = vi.fn<() => Promise<void>>()

    await expect(
      applyInitialAudioTrack(7, {
        strategy: 'direct',
        videoElement: createVideoWithNativeTracks(nativeTracks),
        audioTracks: [
          createAudioTrack(5, 0),
          createAudioTrack(7, 1, { language: 'jpn' }),
        ],
        itemId: 'item-native',
        mediaSourceId: 'source-1',
        onReloadHls,
        nativeTrackTimeoutMs: 0,
      }),
    ).resolves.toEqual({ success: true, reloadRequired: true })

    expect(getVideoStreamUrlMock).toHaveBeenCalledWith(
      {
        itemId: 'item-native',
        mediaSourceId: 'source-1',
        playSessionId: 'play-session-1',
      },
      7,
    )
    expect(onReloadHls).toHaveBeenCalledWith({
      url: 'https://example.com/hls.m3u8',
      playSessionId: 'play-session-1',
    })
  })

  it('falls back to an HLS reload when the browser lacks the native API', async () => {
    const onReloadHls = vi.fn<() => Promise<void>>()
    const video = document.createElement('video')
    Object.defineProperty(video, 'audioTracks', {
      configurable: true,
      value: undefined,
    })

    await expect(
      applyInitialAudioTrack(7, {
        strategy: 'direct',
        videoElement: video,
        audioTracks: [
          createAudioTrack(5, 0),
          createAudioTrack(7, 1, { language: 'jpn' }),
        ],
        itemId: 'item-native',
        onReloadHls,
        nativeTrackTimeoutMs: 0,
      }),
    ).resolves.toEqual({ success: true, reloadRequired: true })

    expect(onReloadHls).toHaveBeenCalledTimes(1)
  })

  it('falls back to an HLS reload when the target codec cannot be decoded', async () => {
    const nativeTracks = createNativeTrackList(['eng', 'jpn'])
    const onReloadHls = vi.fn<() => Promise<void>>()

    await expect(
      applyInitialAudioTrack(7, {
        strategy: 'direct',
        videoElement: createVideoWithNativeTracks(nativeTracks),
        audioTracks: [
          createAudioTrack(5, 0),
          createAudioTrack(7, 1, { language: 'jpn', codec: 'DTS' }),
        ],
        itemId: 'item-native',
        onReloadHls,
        nativeTrackTimeoutMs: 0,
      }),
    ).resolves.toEqual({ success: true, reloadRequired: true })

    expect(nativeTracks.map((track) => track.enabled)).toEqual([true, false])
    expect(onReloadHls).toHaveBeenCalledTimes(1)
  })

  it('becomes a no-op when aborted while waiting for the native track list', async () => {
    const listeners: Array<() => void> = []
    const nativeTracks: TestNativeAudioTrackList = createNativeTrackList([
      'eng',
    ])
    nativeTracks.addEventListener = (_type, listener) => {
      listeners.push(listener)
    }
    nativeTracks.removeEventListener = () => {}
    const onReloadHls = vi.fn<() => Promise<void>>()
    const controller = new AbortController()

    const pending = applyInitialAudioTrack(7, {
      strategy: 'direct',
      videoElement: createVideoWithNativeTracks(nativeTracks),
      audioTracks: [
        createAudioTrack(5, 0),
        createAudioTrack(7, 1, { language: 'jpn' }),
      ],
      itemId: 'item-native',
      onReloadHls,
      nativeTrackTimeoutMs: 5000,
      signal: controller.signal,
    })

    await Promise.resolve()
    controller.abort()
    // A late addtrack must not resurrect the stale application.
    nativeTracks.push({ enabled: false, language: 'jpn' })
    listeners.forEach((listener) => {
      listener()
    })

    await expect(pending).resolves.toEqual({ success: true })
    expect(nativeTracks.map((track) => track.enabled)).toEqual([true, false])
    expect(onReloadHls).not.toHaveBeenCalled()
  })

  it('does not reload when aborted before it starts', async () => {
    const onReloadHls = vi.fn<() => Promise<void>>()
    const controller = new AbortController()
    controller.abort()

    const video = document.createElement('video')
    Object.defineProperty(video, 'audioTracks', {
      configurable: true,
      value: undefined,
    })

    await expect(
      applyInitialAudioTrack(7, {
        strategy: 'direct',
        videoElement: video,
        audioTracks: [
          createAudioTrack(5, 0),
          createAudioTrack(7, 1, { language: 'jpn' }),
        ],
        itemId: 'item-native',
        onReloadHls,
        nativeTrackTimeoutMs: 0,
        signal: controller.signal,
      }),
    ).resolves.toEqual({ success: true })

    expect(onReloadHls).not.toHaveBeenCalled()
  })

  it('reports an error when the requested track is unknown', async () => {
    const nativeTracks = createNativeTrackList(['eng', 'jpn'])

    await expect(
      applyInitialAudioTrack(99, {
        strategy: 'direct',
        videoElement: createVideoWithNativeTracks(nativeTracks),
        audioTracks: [createAudioTrack(5, 0)],
        itemId: 'item-native',
        onReloadHls: vi.fn<() => Promise<void>>(),
        nativeTrackTimeoutMs: 0,
      }),
    ).resolves.toEqual({
      success: false,
      error: {
        type: 'track_unavailable',
        message: 'Audio track with index 99 not found',
        trackIndex: 99,
      },
    })
  })

  it('does nothing in HLS mode, where the track is baked into the transcode', async () => {
    const onReloadHls = vi.fn<() => Promise<void>>()

    await expect(
      applyInitialAudioTrack(7, {
        strategy: 'hls',
        videoElement: document.createElement('video'),
        audioTracks: [
          createAudioTrack(5, 0),
          createAudioTrack(7, 1, { language: 'jpn' }),
        ],
        itemId: 'item-native',
        onReloadHls,
        nativeTrackTimeoutMs: 0,
      }),
    ).resolves.toEqual({ success: true })

    expect(onReloadHls).not.toHaveBeenCalled()
  })
})

describe('switchAudioTrack direct play codec gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createPlaySessionIdMock.mockReturnValue('play-session-1')
    getVideoStreamUrlMock.mockReturnValue('https://example.com/hls.m3u8')
  })

  it('transcodes instead of enabling a native track the browser cannot decode', async () => {
    const nativeTracks = createNativeTrackList(['eng', 'jpn'])
    const onReloadHls = vi.fn<() => Promise<void>>()

    await expect(
      switchAudioTrack(7, {
        strategy: 'direct',
        videoElement: createVideoWithNativeTracks(nativeTracks),
        audioTracks: [
          createAudioTrack(5, 0),
          createAudioTrack(7, 1, { language: 'jpn', codec: 'DTS' }),
        ],
        itemId: 'item-native',
        onReloadHls,
      }),
    ).resolves.toEqual({ success: true, reloadRequired: true })

    expect(nativeTracks.map((track) => track.enabled)).toEqual([true, false])
    expect(onReloadHls).toHaveBeenCalledTimes(1)
  })
})
