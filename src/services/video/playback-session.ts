/**
 * Playback session management for Jellyfin.
 * Reports playback start/stop to enable server-side cleanup of transcoding files.
 *
 * @module services/video/playback-session
 */

import { withApi } from '@/services/jellyfin'
import { generateUUID } from '@/lib/segment-utils'
import { JELLYFIN_CONFIG } from '@/lib/constants'

interface PlaybackSession {
  playSessionId: string
  itemId: string
  mediaSourceId: string
}

let activeSession: PlaybackSession | null = null

/**
 * Creates a new playback session and reports start to Jellyfin.
 * This enables the server to track the session for cleanup.
 */
export async function startPlaybackSession(
  itemId: string,
  mediaSourceId?: string,
): Promise<PlaybackSession> {
  // End any existing session first
  if (activeSession) {
    await stopPlaybackSession()
  }

  const session: PlaybackSession = {
    playSessionId: generateUUID(),
    itemId,
    mediaSourceId: mediaSourceId ?? itemId.replace(/-/g, ''),
  }

  // Report playback start to Jellyfin
  await withApi(async (apis) => {
    await apis.playstateApi.reportPlaybackStart({
      playbackStartInfo: {
        ItemId: itemId,
        PlaySessionId: session.playSessionId,
        MediaSourceId: session.mediaSourceId,
        CanSeek: true,
        PlayMethod: 'Transcode',
      },
    })
  })

  activeSession = session
  return session
}

/**
 * Reports playback stopped to Jellyfin, triggering cleanup of transcoding files.
 */
export async function stopPlaybackSession(
  positionTicks?: number,
): Promise<void> {
  if (!activeSession) return

  const session = activeSession
  activeSession = null

  await withApi(async (apis) => {
    await apis.playstateApi.reportPlaybackStopped({
      playbackStopInfo: {
        ItemId: session.itemId,
        PlaySessionId: session.playSessionId,
        MediaSourceId: session.mediaSourceId,
        PositionTicks: positionTicks,
      },
    })
  })
}

/**
 * Gets the current active session's PlaySessionId.
 * Returns null if no session is active.
 */
export function getActivePlaySessionId(): string | null {
  return activeSession?.playSessionId ?? null
}

/**
 * Gets position ticks from a video element for session stop reporting.
 */
export function getPositionTicks(
  video: HTMLVideoElement | null | undefined,
): number | undefined {
  if (!video || !isFinite(video.currentTime)) return undefined
  return Math.floor(video.currentTime * JELLYFIN_CONFIG.TICKS_PER_SECOND)
}
