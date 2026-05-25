import { useCallback, useEffect, useEffectEvent, useRef } from 'react'
import type { PlaybackStrategy } from '@/services/video/api'
import { getPlaybackMediaSourceId } from '@/services/video/api'
import type { PlaybackStatusPlayMethod } from '@/services/video/playback-session'
import {
  reportPlaybackProgress,
  startPlaybackStatus,
  stopPlaybackStatus,
  stopPlaybackStatusKeepalive,
} from '@/services/video/playback-session'
import { createPlaySessionId } from '@/services/video/session'
import { secondsToTicks } from '@/lib/time-utils'
import type { BaseItemDto } from '@/types/jellyfin'

interface ActivePlaybackStatusSession {
  itemId: string
  mediaSourceId: string
  playSessionId: string
  playMethod: PlaybackStatusPlayMethod
  latestPositionTicks: number
}

interface UsePlaybackStatusOptions {
  itemId: string | null
  mediaSourceId: string | null
  itemRef: React.RefObject<BaseItemDto | null>
  isActiveRef: React.RefObject<boolean>
  playbackRequestIdRef: React.RefObject<number>
  playbackSyncEnabledRef: React.RefObject<boolean>
  /** Ref to the current HLS play session ID (read-only from this hook's perspective) */
  hlsPlaySessionIdRef: React.RefObject<string | null>
  /**
   * Ref to the current strategy. Using a ref (not state) ensures startCurrentPlaybackStatus
   * reads the live strategy even when called synchronously after updateStrategy() within
   * the same render cycle (e.g. switchToHls sets strategy to 'hls' then immediately starts).
   */
  currentStrategyRef: React.RefObject<PlaybackStrategy>
  getActiveVideoElement: () => HTMLVideoElement | null
  /**
   * Strategy state value used as an explicit mode key for the event-listener effect.
   * When strategy flips (direct <-> HLS), the effect re-runs and reattaches listeners
   * to the correct video element.
   */
  strategy: PlaybackStrategy
  jellyfinPlaybackSyncEnabled: boolean
}

export interface UsePlaybackStatusReturn {
  /** Start playback status reporting. Optionally override the initial position ticks. */
  startCurrentPlaybackStatus: (positionTicksOverride?: number) => Promise<void>
  /** Stop playback status reporting (async, normal path). */
  stopCurrentPlaybackStatus: () => Promise<void>
  /** Stop playback status reporting via keepalive fetch (pagehide path). */
  stopCurrentPlaybackStatusKeepalive: () => void
}

/**
 * Manages Jellyfin playback status reporting lifecycle:
 * - Owns the active session ref, start-id versioning, and position tracking.
 * - Wires video event listeners (playing/pause/seeked/interval) to report progress.
 * - Listener effect re-runs when strategy changes so the correct video element is observed.
 */
export function usePlaybackStatus({
  itemId,
  mediaSourceId,
  itemRef,
  isActiveRef,
  playbackRequestIdRef,
  playbackSyncEnabledRef,
  hlsPlaySessionIdRef,
  currentStrategyRef,
  getActiveVideoElement,
  strategy,
  jellyfinPlaybackSyncEnabled,
}: UsePlaybackStatusOptions): UsePlaybackStatusReturn {
  const playbackStatusStartIdRef = useRef(0)
  const activePlaybackStatusRef = useRef<ActivePlaybackStatusSession | null>(
    null,
  )

  const getCurrentPositionTicks = useCallback((): number => {
    const video = getActiveVideoElement()
    const activeSession = activePlaybackStatusRef.current
    if (video !== null) {
      const currentTicks = secondsToTicks(video.currentTime)
      if (activeSession) activeSession.latestPositionTicks = currentTicks
      return currentTicks
    }
    return activeSession?.latestPositionTicks ?? 0
  }, [getActiveVideoElement])

  const startCurrentPlaybackStatus = useCallback(
    async (positionTicksOverride?: number) => {
      if (!playbackSyncEnabledRef.current || !itemId || !mediaSourceId) return
      if (activePlaybackStatusRef.current) return

      const startId = ++playbackStatusStartIdRef.current
      const requestId = playbackRequestIdRef.current

      const video = getActiveVideoElement()
      const positionTicks =
        positionTicksOverride ?? secondsToTicks(video?.currentTime ?? 0)
      const playMethod: PlaybackStatusPlayMethod =
        currentStrategyRef.current === 'hls' ? 'Transcode' : 'DirectPlay'
      const playSessionId =
        playMethod === 'Transcode'
          ? hlsPlaySessionIdRef.current
          : createPlaySessionId()

      if (!playSessionId) return

      const nextSession: ActivePlaybackStatusSession = {
        itemId,
        mediaSourceId,
        playSessionId,
        playMethod,
        latestPositionTicks: positionTicks,
      }

      const isCurrentPlaybackStatusStart = () => {
        const currentMediaSourceId = itemRef.current
          ? (getPlaybackMediaSourceId(itemRef.current) ?? null)
          : null

        return (
          isActiveRef.current &&
          playbackSyncEnabledRef.current &&
          playbackStatusStartIdRef.current === startId &&
          playbackRequestIdRef.current === requestId &&
          itemRef.current?.Id === itemId &&
          currentMediaSourceId === mediaSourceId &&
          !activePlaybackStatusRef.current &&
          (playMethod !== 'Transcode' ||
            hlsPlaySessionIdRef.current === playSessionId)
        )
      }

      try {
        if (!isCurrentPlaybackStatusStart()) return

        await startPlaybackStatus({
          itemId,
          mediaSourceId,
          playSessionId,
          playMethod,
          positionTicks,
          isPaused: video?.paused ?? true,
        })

        if (isCurrentPlaybackStatusStart()) {
          activePlaybackStatusRef.current = nextSession
        } else {
          void stopPlaybackStatus({
            ...nextSession,
            positionTicks: nextSession.latestPositionTicks,
          }).catch((err) => {
            console.debug('Failed to stop stale Jellyfin playback status', err)
          })
        }
      } catch (err) {
        console.debug('Failed to start Jellyfin playback status reporting', err)
      }
    },
    [
      currentStrategyRef,
      getActiveVideoElement,
      hlsPlaySessionIdRef,
      isActiveRef,
      itemId,
      itemRef,
      mediaSourceId,
      playbackRequestIdRef,
      playbackSyncEnabledRef,
    ],
  )

  const consumeActivePlaybackStatus = useCallback(() => {
    const activeSession = activePlaybackStatusRef.current
    const finalPositionTicks = getCurrentPositionTicks()
    activePlaybackStatusRef.current = null
    playbackStatusStartIdRef.current++

    return { activeSession, finalPositionTicks }
  }, [getCurrentPositionTicks])

  const stopCurrentPlaybackStatus = useCallback(async () => {
    const { activeSession, finalPositionTicks } = consumeActivePlaybackStatus()
    if (!activeSession) return

    try {
      await stopPlaybackStatus({
        ...activeSession,
        positionTicks: finalPositionTicks,
      })
    } catch (err) {
      console.debug('Failed to stop Jellyfin playback status reporting', err)
    }
  }, [consumeActivePlaybackStatus])

  const stopCurrentPlaybackStatusKeepalive = useCallback(() => {
    const { activeSession, finalPositionTicks } = consumeActivePlaybackStatus()
    if (!activeSession) return

    stopPlaybackStatusKeepalive({
      ...activeSession,
      positionTicks: finalPositionTicks,
    })
  }, [consumeActivePlaybackStatus])

  const reportCurrentPlaybackProgress = useEffectEvent(
    async (isPaused: boolean) => {
      const activeSession = activePlaybackStatusRef.current
      if (!playbackSyncEnabledRef.current || !activeSession) return

      try {
        await reportPlaybackProgress({
          ...activeSession,
          positionTicks: getCurrentPositionTicks(),
          isPaused,
        })
      } catch (err) {
        console.debug('Failed to report Jellyfin playback progress', err)
      }
    },
  )

  // Wire video event listeners. Re-runs when strategy changes so the correct
  // video element (HLS vs direct) is observed after a mode switch.
  useEffect(() => {
    if (!jellyfinPlaybackSyncEnabled || !itemId) return

    const video = getActiveVideoElement()
    if (!video) return

    const handlePlaying = () => {
      void reportCurrentPlaybackProgress(false)
    }
    const handlePause = () => {
      void reportCurrentPlaybackProgress(true)
    }
    const handleSeeked = () => {
      void reportCurrentPlaybackProgress(video.paused)
    }
    const intervalId = window.setInterval(() => {
      if (!video.paused) void reportCurrentPlaybackProgress(false)
    }, 15_000)

    video.addEventListener('playing', handlePlaying)
    video.addEventListener('pause', handlePause)
    video.addEventListener('seeked', handleSeeked)

    return () => {
      window.clearInterval(intervalId)
      video.removeEventListener('playing', handlePlaying)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('seeked', handleSeeked)
    }
    // strategy is the explicit mode key that forces reattachment on direct<->HLS switch.
    // getActiveVideoElement is stable (useCallback with stable deps) so including it is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jellyfinPlaybackSyncEnabled, itemId, strategy, getActiveVideoElement])

  return {
    startCurrentPlaybackStatus,
    stopCurrentPlaybackStatus,
    stopCurrentPlaybackStatusKeepalive,
  }
}
