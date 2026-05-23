import { buildApiUrl, getCredentials, withApi } from '@/services/jellyfin'

export type PlaybackStatusPlayMethod = 'DirectPlay' | 'Transcode'

interface PlaybackStatusOptions {
  itemId: string
  mediaSourceId: string
  playSessionId: string
  playMethod: PlaybackStatusPlayMethod
  positionTicks: number
  isPaused: boolean
}

interface StopPlaybackStatusOptions {
  itemId: string
  mediaSourceId: string
  playSessionId: string
  positionTicks: number
  failed?: boolean
}

export async function startPlaybackStatus({
  itemId,
  mediaSourceId,
  playSessionId,
  playMethod,
  positionTicks,
  isPaused,
}: PlaybackStatusOptions): Promise<void> {
  await withApi(async (apis) => {
    await apis.playstateApi.reportPlaybackStart({
      playbackStartInfo: {
        ItemId: itemId,
        MediaSourceId: mediaSourceId,
        PlaySessionId: playSessionId,
        PlayMethod: playMethod,
        PositionTicks: positionTicks,
        IsPaused: isPaused,
        CanSeek: true,
      },
    })
  })
}

export async function reportPlaybackProgress({
  itemId,
  mediaSourceId,
  playSessionId,
  playMethod,
  positionTicks,
  isPaused,
}: PlaybackStatusOptions): Promise<void> {
  await withApi(async (apis) => {
    await apis.playstateApi.reportPlaybackProgress({
      playbackProgressInfo: {
        ItemId: itemId,
        MediaSourceId: mediaSourceId,
        PlaySessionId: playSessionId,
        PlayMethod: playMethod,
        PositionTicks: positionTicks,
        IsPaused: isPaused,
        CanSeek: true,
      },
    })
  })
}

export async function stopPlaybackStatus({
  itemId,
  mediaSourceId,
  playSessionId,
  positionTicks,
  failed,
}: StopPlaybackStatusOptions): Promise<void> {
  await withApi(async (apis) => {
    await apis.playstateApi.reportPlaybackStopped({
      playbackStopInfo: {
        ItemId: itemId,
        MediaSourceId: mediaSourceId,
        PlaySessionId: playSessionId,
        PositionTicks: positionTicks,
        Failed: failed,
      },
    })
  })
}

export function stopPlaybackStatusKeepalive({
  itemId,
  mediaSourceId,
  playSessionId,
  positionTicks,
  failed,
}: StopPlaybackStatusOptions): void {
  const { serverAddress, accessToken } = getCredentials()
  const url = buildApiUrl({
    serverAddress,
    accessToken,
    endpoint: 'Sessions/Playing/Stopped',
  })

  if (!url) return

  const body = JSON.stringify({
    ItemId: itemId,
    MediaSourceId: mediaSourceId,
    PlaySessionId: playSessionId,
    PositionTicks: positionTicks,
    Failed: failed,
  })

  try {
    void fetch(url, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
      },
      body,
    })
  } catch (error) {
    console.debug('Failed to queue Jellyfin playback status stop', error)
  }
}
