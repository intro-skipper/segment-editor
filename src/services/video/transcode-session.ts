import {
  buildApiUrl,
  getCredentials,
  getDeviceId,
  withApi,
} from '@/services/jellyfin'
import { jellyfinFetchEmpty } from '@/services/jellyfin/http'

interface ActiveEncodingOptions {
  playSessionId: string | null | undefined
}

const ACTIVE_ENCODINGS_ENDPOINT = 'Videos/ActiveEncodings'

const activeEncodingQuery = (playSessionId: string) =>
  new URLSearchParams({ deviceId: getDeviceId(), playSessionId })

/**
 * Stops the server-side transcode for a play session. Jellyfin hides this
 * endpoint from its OpenAPI spec, so the SDK has no method for it.
 */
export async function stopActiveEncoding({
  playSessionId,
}: ActiveEncodingOptions): Promise<void> {
  if (!playSessionId) return

  await withApi(async (apis) => {
    await jellyfinFetchEmpty({
      baseUrl: apis.api.basePath,
      accessToken: apis.api.accessToken,
      method: 'DELETE',
      endpoint: ACTIVE_ENCODINGS_ENDPOINT,
      query: activeEncodingQuery(playSessionId),
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
    endpoint: ACTIVE_ENCODINGS_ENDPOINT,
    query: activeEncodingQuery(playSessionId),
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
