import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  reportPlaybackProgress,
  startPlaybackStatus,
  stopPlaybackStatus,
  stopPlaybackStatusKeepalive,
} from '@/services/video/playback-session'
import { buildApiUrl, getCredentials, withApi } from '@/services/jellyfin'

vi.mock('@/services/jellyfin', () => ({
  buildApiUrl: vi.fn(),
  getCredentials: vi.fn(),
  withApi: vi.fn(),
}))

const reportPlaybackStart = vi.fn()
const reportPlaybackProgressApi = vi.fn()
const reportPlaybackStopped = vi.fn()

const statusOptions = {
  itemId: 'item-1',
  mediaSourceId: 'media-source-1',
  playSessionId: 'play-session-1',
  playMethod: 'Transcode' as const,
  positionTicks: 123_000_000,
  isPaused: false,
}

describe('playback-session status helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(withApi).mockImplementation(async (callback) => {
      await callback({
        playstateApi: {
          reportPlaybackStart,
          reportPlaybackProgress: reportPlaybackProgressApi,
          reportPlaybackStopped,
        },
      } as never)
      return null
    })
  })

  it('reports playback start with position and selected media source', async () => {
    await startPlaybackStatus(statusOptions)

    expect(reportPlaybackStart).toHaveBeenCalledWith({
      playbackStartInfo: {
        ItemId: 'item-1',
        MediaSourceId: 'media-source-1',
        PlaySessionId: 'play-session-1',
        PlayMethod: 'Transcode',
        PositionTicks: 123_000_000,
        IsPaused: false,
        CanSeek: true,
      },
    })
  })

  it('reports playback progress with paused state and position', async () => {
    await reportPlaybackProgress({ ...statusOptions, isPaused: true })

    expect(reportPlaybackProgressApi).toHaveBeenCalledWith({
      playbackProgressInfo: {
        ItemId: 'item-1',
        MediaSourceId: 'media-source-1',
        PlaySessionId: 'play-session-1',
        PlayMethod: 'Transcode',
        PositionTicks: 123_000_000,
        IsPaused: true,
        CanSeek: true,
      },
    })
  })

  it('reports playback stopped with required final position', async () => {
    await stopPlaybackStatus({
      itemId: 'item-1',
      mediaSourceId: 'media-source-1',
      playSessionId: 'play-session-1',
      positionTicks: 456_000_000,
    })

    expect(reportPlaybackStopped).toHaveBeenCalledWith({
      playbackStopInfo: {
        ItemId: 'item-1',
        MediaSourceId: 'media-source-1',
        PlaySessionId: 'play-session-1',
        PositionTicks: 456_000_000,
        Failed: undefined,
      },
    })
  })

  it('uses raw PlaybackStopInfo JSON for keepalive stop', () => {
    vi.mocked(getCredentials).mockReturnValue({
      serverAddress: 'https://jellyfin.example',
      accessToken: 'token',
    })
    vi.mocked(buildApiUrl).mockReturnValue(
      'https://jellyfin.example/Sessions/Playing/Stopped?ApiKey=token',
    )
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    stopPlaybackStatusKeepalive({
      itemId: 'item-1',
      mediaSourceId: 'media-source-1',
      playSessionId: 'play-session-1',
      positionTicks: 456_000_000,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://jellyfin.example/Sessions/Playing/Stopped?ApiKey=token',
      expect.objectContaining({
        method: 'POST',
        keepalive: true,
        body: JSON.stringify({
          ItemId: 'item-1',
          MediaSourceId: 'media-source-1',
          PlaySessionId: 'play-session-1',
          PositionTicks: 456_000_000,
          Failed: undefined,
        }),
      }),
    )
  })
})
