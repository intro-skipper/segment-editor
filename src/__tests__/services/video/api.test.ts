import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BaseItemDto } from '@/types/jellyfin'
import { getPlaybackConfig, getVideoStreamUrl } from '@/services/video/api'
import { getCredentials, getDeviceId } from '@/services/jellyfin'
import { checkCompatibility } from '@/services/video/compatibility'

vi.mock('@/services/jellyfin', () => ({
  buildApiUrl: vi.fn(({ serverAddress, endpoint, query }) => {
    const params = query ? `?${query.toString()}` : ''
    return `${serverAddress}/${endpoint}${params}`
  }),
  getCredentials: vi.fn(),
  getDeviceId: vi.fn(),
}))

vi.mock('@/services/video/compatibility', () => ({
  checkCompatibility: vi.fn(),
}))

function createPlayableItem(): BaseItemDto {
  return {
    Id: 'item-abc',
    Name: 'Playable Item',
    Type: 'Movie',
    MediaSources: [
      {
        Id: 'source-123',
        Container: 'mp4',
        MediaStreams: [
          { Type: 'Video', Codec: 'h264' },
          { Type: 'Audio', Codec: 'aac', Index: 0 },
        ],
      },
    ],
  } as BaseItemDto
}

describe('getVideoStreamUrl URL serialization', () => {
  beforeEach(() => {
    vi.mocked(getDeviceId).mockReturnValue('test-device')
    vi.mocked(getCredentials).mockReturnValue({
      serverAddress: 'https://jellyfin.example',
      accessToken: 'token',
    })
    vi.mocked(checkCompatibility).mockResolvedValue({ canDirectPlay: true })
  })

  it('includes explicit PlaySessionId in the URL query', () => {
    const url = getVideoStreamUrl({
      itemId: 'item-abc',
      playSessionId: 'session-xyz',
    })

    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('PlaySessionId')).toBe('session-xyz')
  })

  it('includes explicit MediaSourceId in the URL query', () => {
    const url = getVideoStreamUrl({
      itemId: 'item-abc',
      mediaSourceId: 'source-123',
      playSessionId: 'session-xyz',
    })

    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('MediaSourceId')).toBe('source-123')
  })

  it('falls back to itemId (dashes stripped) for MediaSourceId when not provided', () => {
    const url = getVideoStreamUrl({
      itemId: 'item-abc-def',
      playSessionId: 'session-xyz',
    })

    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('MediaSourceId')).toBe('itemabcdef')
  })

  it('includes AudioStreamIndex when provided', () => {
    const url = getVideoStreamUrl(
      { itemId: 'item-abc', playSessionId: 'session-xyz' },
      2,
    )

    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('AudioStreamIndex')).toBe('2')
  })

  it('omits AudioStreamIndex when not provided', () => {
    const url = getVideoStreamUrl({
      itemId: 'item-abc',
      playSessionId: 'session-xyz',
    })

    const params = new URLSearchParams(url.split('?')[1])
    expect(params.has('AudioStreamIndex')).toBe(false)
  })
})

describe('getPlaybackConfig URL integration', () => {
  beforeEach(() => {
    vi.mocked(getDeviceId).mockReturnValue('test-device')
    vi.mocked(getCredentials).mockReturnValue({
      serverAddress: 'https://jellyfin.example',
      accessToken: 'token',
    })
    vi.mocked(checkCompatibility).mockResolvedValue({ canDirectPlay: true })
  })

  it('uses MediaSources[0].Id for direct-play MediaSourceId', async () => {
    const config = await getPlaybackConfig(createPlayableItem())

    const params = new URLSearchParams(config.url.split('?')[1])
    expect(config.strategy).toBe('direct')
    expect(params.get('MediaSourceId')).toBe('source-123')
  })

  it('uses MediaSources[0].Id and explicit PlaySessionId for HLS', async () => {
    vi.mocked(checkCompatibility).mockResolvedValue({ canDirectPlay: false })

    const config = await getPlaybackConfig(
      createPlayableItem(),
      undefined,
      undefined,
      false,
      'hls-session-1',
    )

    const params = new URLSearchParams(config.url.split('?')[1])
    expect(config.strategy).toBe('hls')
    expect(params.get('MediaSourceId')).toBe('source-123')
    expect(params.get('PlaySessionId')).toBe('hls-session-1')
  })
})
