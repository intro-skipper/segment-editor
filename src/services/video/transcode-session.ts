import {
  buildApiUrl,
  getCredentials,
  getDeviceId,
  withApi,
} from '@/services/jellyfin'
interface ActiveEncodingOptions {
  playSessionId: string | null | undefined
}

export async function stopActiveEncoding({
  playSessionId,
}: ActiveEncodingOptions): Promise<void> {
  if (!playSessionId) return

  await withApi(async (apis) => {
    await apis.hlsSegmentApi.stopEncodingProcess({
      deviceId: getDeviceId(),
      playSessionId,
    })
  })
}

export function stopActiveEncodingKeepalive({
  playSessionId,
}: ActiveEncodingOptions): void {
  if (!playSessionId) return

  const { serverAddress, accessToken } = getCredentials()
  const url = buildApiUrl({
    serverAddress,
    accessToken,
    endpoint: 'Videos/ActiveEncodings',
    query: new URLSearchParams({
      deviceId: getDeviceId(),
      playSessionId,
    }),
  })

  if (!url) return

  try {
    void fetch(url, {
      method: 'DELETE',
      keepalive: true,
    })
  } catch (error) {
    console.debug('Failed to queue Jellyfin active encoding cleanup', error)
  }
}
