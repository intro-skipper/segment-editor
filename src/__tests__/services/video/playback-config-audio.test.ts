import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BaseItemDto } from '@/types/jellyfin'
import type * as CompatibilityModule from '@/services/video/compatibility'
import { extractMediaSourceInfo, getPlaybackConfig } from '@/services/video/api'
import { checkCompatibility } from '@/services/video/compatibility'
import { supportsNativeAudioTrackSwitching } from '@/services/video/capabilities'
import { createPlaySessionId } from '@/services/video/session'

vi.mock('@/services/jellyfin', () => ({
  buildApiUrl: vi.fn(({ serverAddress, endpoint, query }) => {
    const params = query ? `?${query.toString()}` : ''
    return `${serverAddress}/${endpoint}${params}`
  }),
  getCredentials: vi.fn(() => ({
    serverAddress: 'https://jellyfin.example',
    accessToken: 'token',
  })),
  getDeviceId: vi.fn(() => 'test-device'),
}))

vi.mock('@/services/video/compatibility', async (importOriginal) => {
  const original = await importOriginal<typeof CompatibilityModule>()
  return {
    ...original,
    checkCompatibility: vi.fn(),
  }
})

vi.mock('@/services/video/capabilities', () => ({
  supportsNativeAudioTrackSwitching: vi.fn(),
}))

vi.mock('@/services/video/session', () => ({
  createPlaySessionId: vi.fn(() => 'generated-session-id'),
}))

const AAC_STREAM_INDEX = 1
const SECOND_AAC_STREAM_INDEX = 2
const DTS_STREAM_INDEX = 3

function createMultiAudioItem(): BaseItemDto {
  return {
    Id: 'item-abc',
    Name: 'Multi audio item',
    Type: 'Movie',
    MediaSources: [
      {
        Id: 'source-123',
        Container: 'mkv',
        Bitrate: 12_000_000,
        MediaStreams: [
          {
            Type: 'Video',
            Index: 0,
            Codec: 'h264',
            Profile: 'High',
            Level: 41,
            Width: 1920,
            Height: 800,
            BitRate: 9_500_000,
            BitDepth: 8,
            VideoRange: 'SDR',
            AverageFrameRate: 23.976,
          },
          {
            Type: 'Audio',
            Index: AAC_STREAM_INDEX,
            Codec: 'aac',
            Channels: 2,
            IsDefault: true,
          },
          {
            Type: 'Audio',
            Index: SECOND_AAC_STREAM_INDEX,
            Codec: 'aac',
            Channels: 6,
          },
          { Type: 'Audio', Index: DTS_STREAM_INDEX, Codec: 'dts', Channels: 8 },
          { Type: 'Subtitle', Index: 4, Codec: 'subrip' },
        ],
      },
    ],
  }
}

describe('extractMediaSourceInfo stream metadata', () => {
  it('extracts full video metadata and every audio stream', () => {
    const info = extractMediaSourceInfo(createMultiAudioItem())

    expect(info).toMatchObject({
      container: 'mkv',
      videoCodec: 'h264',
      audioCodec: 'aac',
      bitrate: 12_000_000,
      video: {
        codec: 'h264',
        profile: 'High',
        level: 41,
        width: 1920,
        height: 800,
        bitrate: 9_500_000,
        bitDepth: 8,
        videoRange: 'SDR',
        frameRate: 23.976,
      },
      audioStreams: [
        { index: AAC_STREAM_INDEX, codec: 'aac', channels: 2 },
        { index: SECOND_AAC_STREAM_INDEX, codec: 'aac', channels: 6 },
        { index: DTS_STREAM_INDEX, codec: 'dts', channels: 8 },
      ],
    })
  })

  it('falls back to the real frame rate and tolerates missing details', () => {
    const info = extractMediaSourceInfo({
      Id: 'item-sparse',
      MediaSources: [
        {
          Container: 'mp4',
          MediaStreams: [
            { Type: 'Video', Index: 0, Codec: 'hevc', RealFrameRate: 25 },
            { Type: 'Audio', Codec: 'flac' },
          ],
        },
      ],
    })

    expect(info?.video).toEqual({
      codec: 'hevc',
      profile: undefined,
      level: undefined,
      width: undefined,
      height: undefined,
      bitrate: undefined,
      bitDepth: undefined,
      videoRange: undefined,
      frameRate: 25,
    })
    expect(info?.audioStreams).toEqual([
      { index: 0, codec: 'flac', channels: undefined },
    ])
  })
})

describe('getPlaybackConfig non-default audio track selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkCompatibility).mockResolvedValue({ canDirectPlay: true })
    vi.mocked(createPlaySessionId).mockReturnValue('generated-session-id')
    vi.mocked(supportsNativeAudioTrackSwitching).mockReturnValue(true)
  })

  it('direct plays a non-default audio track when native switching is available', async () => {
    const config = await getPlaybackConfig(
      createMultiAudioItem(),
      undefined,
      SECOND_AAC_STREAM_INDEX,
    )

    expect(config.strategy).toBe('direct')
    expect(config.url).toContain('Videos/item-abc/stream')
    expect(config.url).not.toContain('AudioStreamIndex')
  })

  it('transcodes a non-default audio track when native switching is unavailable', async () => {
    vi.mocked(supportsNativeAudioTrackSwitching).mockReturnValue(false)

    const config = await getPlaybackConfig(
      createMultiAudioItem(),
      undefined,
      SECOND_AAC_STREAM_INDEX,
    )

    const params = new URLSearchParams(config.url.split('?')[1])
    expect(config.strategy).toBe('hls')
    expect(params.get('AudioStreamIndex')).toBe(String(SECOND_AAC_STREAM_INDEX))
  })

  it('transcodes when the requested track codec cannot be decoded', async () => {
    const config = await getPlaybackConfig(
      createMultiAudioItem(),
      undefined,
      DTS_STREAM_INDEX,
    )

    const params = new URLSearchParams(config.url.split('?')[1])
    expect(config.strategy).toBe('hls')
    expect(params.get('AudioStreamIndex')).toBe(String(DTS_STREAM_INDEX))
  })

  it('transcodes when the requested track is not part of the media source', async () => {
    const config = await getPlaybackConfig(
      createMultiAudioItem(),
      undefined,
      42,
    )

    expect(config.strategy).toBe('hls')
  })

  it('direct plays the first audio track regardless of native support', async () => {
    vi.mocked(supportsNativeAudioTrackSwitching).mockReturnValue(false)

    const config = await getPlaybackConfig(
      createMultiAudioItem(),
      undefined,
      AAC_STREAM_INDEX,
    )

    expect(config.strategy).toBe('direct')
    expect(supportsNativeAudioTrackSwitching).not.toHaveBeenCalled()
  })

  it('keeps forcing HLS during direct play fallback', async () => {
    const config = await getPlaybackConfig(
      createMultiAudioItem(),
      undefined,
      SECOND_AAC_STREAM_INDEX,
      true,
      'hls-session-1',
    )

    const params = new URLSearchParams(config.url.split('?')[1])
    expect(config.strategy).toBe('hls')
    expect(params.get('PlaySessionId')).toBe('hls-session-1')
  })

  it('keeps transcoding incompatible media even with native switching', async () => {
    vi.mocked(checkCompatibility).mockResolvedValue({
      canDirectPlay: false,
      reason: 'Unsupported container format: avi',
    })

    const config = await getPlaybackConfig(
      createMultiAudioItem(),
      undefined,
      SECOND_AAC_STREAM_INDEX,
    )

    expect(config.strategy).toBe('hls')
  })
})
