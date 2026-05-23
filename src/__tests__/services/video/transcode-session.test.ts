import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  stopActiveEncoding,
  stopActiveEncodingKeepalive,
} from '@/services/video/transcode-session'
import {
  buildApiUrl,
  getCredentials,
  getDeviceId,
  withApi,
} from '@/services/jellyfin'

vi.mock('@/services/jellyfin', () => ({
  buildApiUrl: vi.fn(),
  getCredentials: vi.fn(),
  getDeviceId: vi.fn(),
  withApi: vi.fn(),
}))

const stopEncodingProcess = vi.fn()

describe('transcode-session active encoding cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getDeviceId).mockReturnValue('device-1')
    vi.mocked(withApi).mockImplementation(async (callback) => {
      await callback({
        hlsSegmentApi: { stopEncodingProcess },
      } as never)
      return null
    })
  })

  it('stops active encoding through the HLS segment API', async () => {
    await stopActiveEncoding({ playSessionId: 'play-session-1' })

    expect(stopEncodingProcess).toHaveBeenCalledWith({
      deviceId: 'device-1',
      playSessionId: 'play-session-1',
    })
  })

  it('does not call cleanup without a play session id', async () => {
    await stopActiveEncoding({ playSessionId: null })

    expect(withApi).not.toHaveBeenCalled()
  })

  it('uses DELETE keepalive for pagehide active encoding cleanup', () => {
    vi.mocked(getCredentials).mockReturnValue({
      serverAddress: 'https://jellyfin.example',
      accessToken: 'token',
    })
    vi.mocked(buildApiUrl).mockReturnValue(
      'https://jellyfin.example/Videos/ActiveEncodings?deviceId=device-1&playSessionId=play-session-1&ApiKey=token',
    )
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    stopActiveEncodingKeepalive({ playSessionId: 'play-session-1' })

    const buildApiUrlOptions = vi.mocked(buildApiUrl).mock.calls[0][0]
    const query = buildApiUrlOptions.query ?? new URLSearchParams()

    expect(buildApiUrlOptions.endpoint).toBe('Videos/ActiveEncodings')
    expect(query.get('deviceId')).toBe('device-1')
    expect(query.get('playSessionId')).toBe('play-session-1')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://jellyfin.example/Videos/ActiveEncodings?deviceId=device-1&playSessionId=play-session-1&ApiKey=token',
      { method: 'DELETE', keepalive: true },
    )
  })
})
