import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as CapabilitiesModule from '@/services/video/capabilities'
import {
  buildAudioContentType,
  buildAv1CodecString,
  buildH264CodecString,
  buildHevcCodecString,
  buildVideoContentType,
  buildVp9CodecString,
  checkCompatibility,
  clearCache,
  getDirectPlayContainers,
  isAudioTrackDirectPlayable,
  isCodecSupported,
  isDirectPlayContainerSupported,
} from '@/services/video/compatibility'

const probeCanPlayTypeMock = vi.hoisted(() => vi.fn<() => string>(() => ''))
const isFirefoxMock = vi.hoisted(() => vi.fn<() => boolean>(() => false))
const isSafariMock = vi.hoisted(() => vi.fn<() => boolean>(() => false))

vi.mock('@/services/video/capabilities', async (importOriginal) => {
  const original = await importOriginal<typeof CapabilitiesModule>()
  return {
    ...original,
    probeCanPlayType: probeCanPlayTypeMock,
    isFirefox: isFirefoxMock,
    isSafari: isSafariMock,
  }
})

describe('H.264 codec strings', () => {
  it('derives profile and level from stream metadata', () => {
    expect(buildH264CodecString('High', 4.1)).toBe('avc1.640029')
    expect(buildH264CodecString('Main', 3.1)).toBe('avc1.4D001F')
    expect(buildH264CodecString('Baseline', 3)).toBe('avc1.42001E')
    expect(buildH264CodecString('Constrained Baseline', 3)).toBe('avc1.42001E')
  })

  it('accepts levels reported in either the 4.1 or 41 shape', () => {
    expect(buildH264CodecString('High', 41)).toBe(
      buildH264CodecString('High', 4.1),
    )
    expect(buildH264CodecString('High', 51)).toBe('avc1.640033')
  })

  it('falls back to High@4.0 when metadata is missing', () => {
    expect(buildH264CodecString()).toBe('avc1.640028')
    expect(buildH264CodecString('High')).toBe('avc1.640028')
    expect(buildH264CodecString(undefined, 4.1)).toBe('avc1.640029')
    expect(buildH264CodecString('Unknown Profile', 4.1)).toBe('avc1.640029')
    expect(buildH264CodecString('High', 0)).toBe('avc1.640028')
  })
})

describe('HEVC codec strings', () => {
  it('derives the general level id from the reported level', () => {
    expect(buildHevcCodecString('Main', 4.1)).toBe('hvc1.1.6.L123.B0')
    expect(buildHevcCodecString('Main', 123)).toBe('hvc1.1.6.L123.B0')
    expect(buildHevcCodecString('Main', 5.1)).toBe('hvc1.1.6.L153.B0')
    // 30 is general_level_idc for level 1.0, not a decimal level.
    expect(buildHevcCodecString('Main', 30)).toBe('hvc1.1.6.L30.B0')
  })

  it('uses the Main 10 profile prefix for 10-bit profiles', () => {
    expect(buildHevcCodecString('Main 10', 4.1)).toBe('hvc1.2.4.L123.B0')
    expect(buildHevcCodecString('main10', 120)).toBe('hvc1.2.4.L120.B0')
  })

  it('falls back to L123 when the level is missing', () => {
    expect(buildHevcCodecString()).toBe('hvc1.1.6.L123.B0')
    expect(buildHevcCodecString('Main')).toBe('hvc1.1.6.L123.B0')
  })
})

describe('AV1 codec strings', () => {
  it('uses the reported seq_level_idx and bit depth', () => {
    expect(buildAv1CodecString(undefined, 8, 8)).toBe('av01.0.08M.08')
    expect(buildAv1CodecString(undefined, 13, 10)).toBe('av01.0.13M.10')
  })

  it('maps the reported profile name onto the profile id', () => {
    expect(buildAv1CodecString('Main', 8, 8)).toBe('av01.0.08M.08')
    expect(buildAv1CodecString('High', 8, 8)).toBe('av01.1.08M.08')
    expect(buildAv1CodecString('Professional', 8, 10)).toBe('av01.2.08M.10')
  })

  it('selects the Professional profile for 12-bit streams', () => {
    expect(buildAv1CodecString(undefined, 12, 12)).toBe('av01.2.12M.12')
    expect(buildAv1CodecString('Main', 12, 12)).toBe('av01.2.12M.12')
    expect(buildAv1CodecString(undefined, undefined, 12)).toBe('av01.2.08M.12')
  })

  it('converts a major.minor level into a seq_level_idx', () => {
    expect(buildAv1CodecString(undefined, 4.1)).toBe('av01.0.09M.08')
    expect(buildAv1CodecString(undefined, 6.3)).toBe('av01.0.19M.08')
  })

  it('falls back to seq level 8 and 8-bit when metadata is missing', () => {
    expect(buildAv1CodecString()).toBe('av01.0.08M.08')
    expect(buildAv1CodecString(undefined, 99)).toBe('av01.0.08M.08')
  })
})

describe('VP9 codec strings', () => {
  it('derives profile, level and bit depth', () => {
    expect(buildVp9CodecString('Profile 2', 4.1, 10)).toBe('vp09.02.41.10')
    expect(buildVp9CodecString('Profile 0', 3, 8)).toBe('vp09.00.30.08')
  })

  it('keeps 12-bit streams 12-bit and promotes 8-bit profiles', () => {
    expect(buildVp9CodecString('Profile 2', 4.1, 12)).toBe('vp09.02.41.12')
    expect(buildVp9CodecString('Profile 0', 4.1, 10)).toBe('vp09.02.41.10')
    expect(buildVp9CodecString('Profile 1', 4.1, 12)).toBe('vp09.03.41.12')
    expect(buildVp9CodecString(undefined, undefined, 10)).toBe('vp09.02.10.10')
  })

  it('falls back to the profile 0 / level 1.0 / 8-bit default', () => {
    expect(buildVp9CodecString()).toBe('vp09.00.10.08')
  })
})

describe('content type builders', () => {
  it('wraps video codec strings in the matching container MIME type', () => {
    expect(
      buildVideoContentType('h264', {
        codec: 'h264',
        profile: 'High',
        level: 4.1,
      }),
    ).toBe('video/mp4; codecs="avc1.640029"')
    expect(buildVideoContentType('hevc', { codec: 'hevc' })).toBe(
      'video/mp4; codecs="hvc1.1.6.L123.B0"',
    )
    expect(buildVideoContentType('h265', { codec: 'h265' })).toBe(
      'video/mp4; codecs="hvc1.1.6.L123.B0"',
    )
    expect(buildVideoContentType('av1', { codec: 'av1', bitDepth: 10 })).toBe(
      'video/mp4; codecs="av01.0.08M.10"',
    )
    expect(buildVideoContentType('vp9')).toBe(
      'video/webm; codecs="vp09.00.10.08"',
    )
    expect(buildVideoContentType('mpeg2')).toBeNull()
  })

  it('maps audio codecs to content types, including E-AC-3', () => {
    expect(buildAudioContentType('aac')).toBe('audio/mp4; codecs="mp4a.40.2"')
    expect(buildAudioContentType('MP3')).toBe('audio/mpeg')
    expect(buildAudioContentType('ac3')).toBe('audio/mp4; codecs="ac-3"')
    expect(buildAudioContentType('eac3')).toBe('audio/mp4; codecs="ec-3"')
    expect(buildAudioContentType('dts')).toBeNull()
  })
})

describe('container feature detection', () => {
  beforeEach(() => {
    clearCache()
    vi.clearAllMocks()
    probeCanPlayTypeMock.mockReturnValue('')
    isFirefoxMock.mockReturnValue(false)
    isSafariMock.mockReturnValue(false)
  })

  it('supports mp4 and webm without probing', () => {
    expect(isDirectPlayContainerSupported('mp4')).toBe(true)
    expect(isDirectPlayContainerSupported('WEBM')).toBe(true)
    expect(probeCanPlayTypeMock).not.toHaveBeenCalled()
  })

  it('rejects containers outside the direct play list', () => {
    expect(isDirectPlayContainerSupported('avi')).toBe(false)
    expect(isDirectPlayContainerSupported('')).toBe(false)
  })

  it('supports mkv only when canPlayType recognizes matroska', () => {
    probeCanPlayTypeMock.mockReturnValue('')
    expect(isDirectPlayContainerSupported('mkv')).toBe(false)

    probeCanPlayTypeMock.mockReturnValue('maybe')
    expect(isDirectPlayContainerSupported('mkv')).toBe(true)
    expect(probeCanPlayTypeMock).toHaveBeenLastCalledWith('video/x-matroska')
  })

  it('keeps mkv blocked on Firefox even when canPlayType reports support', () => {
    probeCanPlayTypeMock.mockReturnValue('maybe')
    isFirefoxMock.mockReturnValue(true)

    expect(isDirectPlayContainerSupported('mkv')).toBe(false)
  })

  it('reports only the containers the browser can direct play', () => {
    probeCanPlayTypeMock.mockReturnValue('')
    expect(getDirectPlayContainers()).toEqual(['mp4', 'webm'])

    probeCanPlayTypeMock.mockReturnValue('maybe')
    expect(getDirectPlayContainers()).toEqual(['mp4', 'mkv', 'webm'])
  })
})

describe('per-track audio playability', () => {
  it('accepts direct playable codecs case-insensitively', () => {
    expect(isAudioTrackDirectPlayable('aac')).toBe(true)
    expect(isAudioTrackDirectPlayable('AAC')).toBe(true)
    expect(isAudioTrackDirectPlayable('eac3')).toBe(true)
  })

  it('rejects codecs the browser cannot decode', () => {
    expect(isAudioTrackDirectPlayable('dts')).toBe(false)
    expect(isAudioTrackDirectPlayable('truehd')).toBe(false)
    expect(isAudioTrackDirectPlayable('')).toBe(false)
  })
})

describe('checkCompatibility decoding configs', () => {
  const decodingInfo = vi.fn(async (_config?: MediaDecodingConfiguration) => ({
    supported: true,
    smooth: true,
    powerEfficient: true,
  }))

  beforeEach(() => {
    clearCache()
    vi.clearAllMocks()
    probeCanPlayTypeMock.mockReturnValue('maybe')
    isFirefoxMock.mockReturnValue(false)
    isSafariMock.mockReturnValue(false)
    vi.stubGlobal('navigator', {
      userAgent: 'test',
      mediaCapabilities: { decodingInfo },
    })
  })

  it('passes the real stream metadata to decodingInfo', async () => {
    const result = await checkCompatibility({
      container: 'mkv',
      videoCodec: 'h264',
      audioCodec: 'eac3',
      video: {
        codec: 'h264',
        profile: 'Main',
        level: 3.1,
        width: 1280,
        height: 720,
        bitrate: 4_000_000,
        frameRate: 23.976,
      },
      audioStreams: [
        { index: 1, codec: 'eac3', channels: 6 },
        { index: 2, codec: 'dts', channels: 8 },
      ],
    })

    expect(result).toEqual({ canDirectPlay: true })
    expect(decodingInfo).toHaveBeenNthCalledWith(1, {
      type: 'file',
      video: {
        contentType: 'video/mp4; codecs="avc1.4D001F"',
        width: 1280,
        height: 720,
        // Bitrate is bucketed to whole Mbps and framerate rounded so files at
        // the same quality tier share one cached probe result.
        bitrate: 4_000_000,
        framerate: 24,
      },
    })
    expect(decodingInfo).toHaveBeenNthCalledWith(2, {
      type: 'file',
      audio: {
        contentType: 'audio/mp4; codecs="ec-3"',
        channels: '6',
        bitrate: 128_000,
        samplerate: 48_000,
      },
    })
  })

  it('falls back to 1080p defaults when metadata is missing', async () => {
    await checkCompatibility({
      container: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
    })

    expect(decodingInfo).toHaveBeenNthCalledWith(1, {
      type: 'file',
      video: {
        contentType: 'video/mp4; codecs="avc1.640028"',
        width: 1920,
        height: 1080,
        bitrate: 10_000_000,
        framerate: 30,
      },
    })
    expect(decodingInfo).toHaveBeenNthCalledWith(2, {
      type: 'file',
      audio: {
        contentType: 'audio/mp4; codecs="mp4a.40.2"',
        channels: '2',
        bitrate: 128_000,
        samplerate: 48_000,
      },
    })
  })

  it('does not let an unsupported non-default audio track block direct play', async () => {
    const result = await checkCompatibility({
      container: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      audioStreams: [
        { index: 1, codec: 'aac', channels: 2 },
        { index: 2, codec: 'dts', channels: 8 },
      ],
    })

    expect(result).toEqual({ canDirectPlay: true })
  })

  it('rejects mkv when the browser does not recognize matroska', async () => {
    probeCanPlayTypeMock.mockReturnValue('')

    const result = await checkCompatibility({
      container: 'mkv',
      videoCodec: 'h264',
      audioCodec: 'aac',
    })

    expect(result.canDirectPlay).toBe(false)
    expect(result.reason).toContain('container')
  })

  it('gates direct play on the IsDefault audio stream, not the first one', async () => {
    const rejected = await checkCompatibility({
      container: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      audioStreams: [
        { index: 1, codec: 'aac', channels: 2 },
        { index: 2, codec: 'dts', channels: 8, isDefault: true },
      ],
    })

    expect(rejected.canDirectPlay).toBe(false)
    expect(rejected.reason).toContain('dts')

    const accepted = await checkCompatibility({
      container: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'dts',
      audioStreams: [
        { index: 1, codec: 'dts', channels: 8 },
        { index: 2, codec: 'aac', channels: 2, isDefault: true },
      ],
    })

    expect(accepted).toEqual({ canDirectPlay: true })
    expect(decodingInfo).toHaveBeenLastCalledWith({
      type: 'file',
      audio: {
        contentType: 'audio/mp4; codecs="mp4a.40.2"',
        channels: '2',
        bitrate: 128_000,
        samplerate: 48_000,
      },
    })
  })

  it('probes HDR streams with the HDR decoding dictionary', async () => {
    await checkCompatibility({
      container: 'mp4',
      videoCodec: 'hevc',
      audioCodec: 'aac',
      video: {
        codec: 'hevc',
        profile: 'Main 10',
        level: 153,
        width: 3840,
        height: 2160,
        bitrate: 20_000_000,
        bitDepth: 10,
        videoRange: 'HDR',
        frameRate: 24,
      },
    })

    expect(decodingInfo).toHaveBeenNthCalledWith(1, {
      type: 'file',
      video: {
        contentType: 'video/mp4; codecs="hvc1.2.4.L153.B0"',
        width: 3840,
        height: 2160,
        bitrate: 20_000_000,
        framerate: 24,
        transferFunction: 'pq',
        colorGamut: 'rec2020',
        hdrMetadataType: 'smpteSt2086',
      },
    })
  })

  it('retries without the HDR dictionary when the browser rejects it', async () => {
    decodingInfo
      .mockRejectedValueOnce(new TypeError('unsupported member'))
      .mockResolvedValue({
        supported: true,
        smooth: true,
        powerEfficient: true,
      })

    const supported = await isCodecSupported('hevc', 'video', {
      video: { codec: 'hevc', videoRange: 'HDR' },
    })

    expect(supported).toBe(true)
    expect(decodingInfo).toHaveBeenCalledTimes(2)
    const retryVideo = decodingInfo.mock.calls[1][0]?.video
    expect(retryVideo).toBeDefined()
    expect(retryVideo?.transferFunction).toBeUndefined()
    expect(retryVideo?.hdrMetadataType).toBeUndefined()
    expect(retryVideo?.colorGamut).toBeUndefined()
  })

  it('buckets bitrates to whole Mbps in the capability cache key', async () => {
    await isCodecSupported('h264', 'video', {
      video: { codec: 'h264', bitrate: 4_000_001 },
    })
    await isCodecSupported('h264', 'video', {
      video: { codec: 'h264', bitrate: 4_900_000 },
    })

    expect(decodingInfo).toHaveBeenCalledTimes(1)
  })
})
