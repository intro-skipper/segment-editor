import { useCallback, useRef } from 'react'
import {
  stopActiveEncoding,
  stopActiveEncodingKeepalive,
} from '@/services/video/transcode-session'

export interface UseHlsEncodingReturn {
  /** Ref to the current HLS play session ID. Read by usePlaybackStatus to validate Transcode sessions. */
  hlsPlaySessionIdRef: React.RefObject<string | null>
  /** Set the current HLS play session ID. Pass null to clear (direct-play branch). */
  setHlsPlaySessionId: (id: string | null) => void
  /** Stop the current HLS encoding session (async, normal path). Clears the ref. */
  stopCurrentHlsEncoding: () => Promise<void>
  /** Stop the current HLS encoding session via keepalive fetch (pagehide path). Clears the ref. */
  stopCurrentHlsEncodingKeepalive: () => void
  /**
   * Stop a specific previous HLS encoding session by explicit ID.
   * Used during HLS reload when the session ID changes: the old session must be
   * stopped before the new one is set.
   */
  stopPreviousHlsEncoding: (previousPlaySessionId: string) => Promise<void>
}

/**
 * Manages the HLS encoding session lifecycle:
 * - Owns the hlsPlaySessionId ref.
 * - Provides set/clear, normal stop, keepalive stop, and stop-previous-explicit-id.
 */
export function useHlsEncoding(): UseHlsEncodingReturn {
  const hlsPlaySessionIdRef = useRef<string | null>(null)

  const setHlsPlaySessionId = useCallback((id: string | null) => {
    hlsPlaySessionIdRef.current = id
  }, [])

  const stopCurrentHlsEncoding = useCallback(async () => {
    const playSessionId = hlsPlaySessionIdRef.current
    hlsPlaySessionIdRef.current = null
    try {
      await stopActiveEncoding({ playSessionId })
    } catch (err) {
      console.debug('Failed to stop Jellyfin active encoding', err)
    }
  }, [])

  const stopCurrentHlsEncodingKeepalive = useCallback(() => {
    const playSessionId = hlsPlaySessionIdRef.current
    hlsPlaySessionIdRef.current = null
    stopActiveEncodingKeepalive({ playSessionId })
  }, [])

  const stopPreviousHlsEncoding = useCallback(
    async (previousPlaySessionId: string) => {
      try {
        await stopActiveEncoding({ playSessionId: previousPlaySessionId })
      } catch (err) {
        console.debug('Failed to stop previous Jellyfin active encoding', err)
      }
    },
    [],
  )

  return {
    hlsPlaySessionIdRef,
    setHlsPlaySessionId,
    stopCurrentHlsEncoding,
    stopCurrentHlsEncodingKeepalive,
    stopPreviousHlsEncoding,
  }
}
