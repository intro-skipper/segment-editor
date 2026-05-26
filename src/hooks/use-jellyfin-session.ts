import { useCallback, useEffect, useEffectEvent, useMemo, useRef } from 'react'
import type { PlaybackStrategy } from '@/services/video/api'
import type { PlaybackStatusPlayMethod } from '@/services/video/playback-session'
import {
  reportPlaybackProgress,
  startPlaybackStatus,
  stopPlaybackStatus,
  stopPlaybackStatusKeepalive,
} from '@/services/video/playback-session'
import {
  stopActiveEncoding,
  stopActiveEncodingKeepalive,
} from '@/services/video/transcode-session'
import { secondsToTicks } from '@/lib/time-utils'

export interface JellyfinSessionDescriptor {
  itemId: string
  mediaSourceId: string
  playSessionId: string
  strategy: PlaybackStrategy
  syncEnabled: boolean
}

interface ActivePlaybackStatusSession {
  itemId: string
  mediaSourceId: string
  playSessionId: string
  playMethod: PlaybackStatusPlayMethod
  latestPositionTicks: number
}

interface PendingPlaybackStatusSession {
  descriptor: JellyfinSessionDescriptor
  session: ActivePlaybackStatusSession
  startId: number
  stopQueuedWithKeepalive?: boolean
}

interface UseJellyfinSessionOptions {
  session: JellyfinSessionDescriptor | null
  getActiveVideoElement: () => HTMLVideoElement | null
}

export interface UseJellyfinSessionReturn {
  /** Start reporting. Call after playback config is applied. */
  startPlaybackStatus: (positionTicksOverride?: number) => Promise<void>
  /** Stop reporting (async, normal path). */
  stopPlaybackStatus: () => Promise<void>
  /** Stop reporting + encoding via keepalive (pagehide path). */
  stopAllKeepalive: () => void
  /** Stop a previous HLS encoding session by explicit ID. */
  stopPreviousEncoding: (previousPlaySessionId: string) => Promise<void>
}

function playMethodForStrategy(
  strategy: PlaybackStrategy,
): PlaybackStatusPlayMethod {
  return strategy === 'hls' ? 'Transcode' : 'DirectPlay'
}

function createActiveSession(
  descriptor: JellyfinSessionDescriptor,
  positionTicks: number,
): ActivePlaybackStatusSession {
  return {
    itemId: descriptor.itemId,
    mediaSourceId: descriptor.mediaSourceId,
    playSessionId: descriptor.playSessionId,
    playMethod: playMethodForStrategy(descriptor.strategy),
    latestPositionTicks: positionTicks,
  }
}

function isSameSession(
  left: JellyfinSessionDescriptor | null,
  right: JellyfinSessionDescriptor,
): boolean {
  return (
    left !== null &&
    left.itemId === right.itemId &&
    left.mediaSourceId === right.mediaSourceId &&
    left.playSessionId === right.playSessionId &&
    left.strategy === right.strategy
  )
}

function isSameActiveSession(
  activeSession: ActivePlaybackStatusSession,
  descriptor: JellyfinSessionDescriptor,
): boolean {
  return (
    activeSession.itemId === descriptor.itemId &&
    activeSession.mediaSourceId === descriptor.mediaSourceId &&
    activeSession.playSessionId === descriptor.playSessionId &&
    activeSession.playMethod === playMethodForStrategy(descriptor.strategy)
  )
}

export function useJellyfinSession({
  session,
  getActiveVideoElement,
}: UseJellyfinSessionOptions): UseJellyfinSessionReturn {
  const currentSessionRef = useRef<JellyfinSessionDescriptor | null>(session)
  const playbackStatusStartIdRef = useRef(0)
  const activePlaybackStatusRef = useRef<ActivePlaybackStatusSession | null>(
    null,
  )
  const pendingPlaybackStatusRef = useRef<PendingPlaybackStatusSession | null>(
    null,
  )
  const hlsEncodingPlaySessionIdRef = useRef<string | null>(
    session?.strategy === 'hls' ? session.playSessionId : null,
  )

  currentSessionRef.current = session

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

  const consumeActivePlaybackStatus = useCallback(() => {
    const activeSession = activePlaybackStatusRef.current
    const finalPositionTicks = getCurrentPositionTicks()
    activePlaybackStatusRef.current = null
    playbackStatusStartIdRef.current++

    return { activeSession, finalPositionTicks }
  }, [getCurrentPositionTicks])

  const stopPlaybackStatusReporting = useCallback(async () => {
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

  const stopPlaybackStatusReportingKeepalive = useCallback(() => {
    const { activeSession, finalPositionTicks } = consumeActivePlaybackStatus()
    if (activeSession) {
      stopPlaybackStatusKeepalive({
        ...activeSession,
        positionTicks: finalPositionTicks,
      })
      return
    }

    const pendingSession = pendingPlaybackStatusRef.current
    if (!pendingSession) return

    pendingSession.stopQueuedWithKeepalive = true
    pendingPlaybackStatusRef.current = null
    stopPlaybackStatusKeepalive({
      ...pendingSession.session,
      positionTicks: getActiveVideoElement()
        ? finalPositionTicks
        : pendingSession.session.latestPositionTicks,
    })
  }, [consumeActivePlaybackStatus, getActiveVideoElement])

  const startPlaybackStatusReporting = useCallback(
    async (positionTicksOverride?: number) => {
      const descriptor = currentSessionRef.current
      if (!descriptor?.syncEnabled) return

      const activeSession = activePlaybackStatusRef.current
      if (activeSession && isSameActiveSession(activeSession, descriptor)) {
        return
      }

      const video = getActiveVideoElement()
      const positionTicks =
        positionTicksOverride ?? secondsToTicks(video?.currentTime ?? 0)
      const pendingSession = pendingPlaybackStatusRef.current

      if (
        pendingSession &&
        isSameSession(descriptor, pendingSession.descriptor)
      ) {
        pendingSession.startId = ++playbackStatusStartIdRef.current
        pendingSession.session.latestPositionTicks = positionTicks
        return
      }

      const startId = ++playbackStatusStartIdRef.current
      const nextSession: PendingPlaybackStatusSession = {
        descriptor,
        session: createActiveSession(descriptor, positionTicks),
        startId,
      }
      pendingPlaybackStatusRef.current = nextSession

      const isCurrentPlaybackStatusStart = () =>
        pendingPlaybackStatusRef.current === nextSession &&
        playbackStatusStartIdRef.current === nextSession.startId &&
        isSameSession(currentSessionRef.current, descriptor) &&
        !activePlaybackStatusRef.current

      try {
        if (!isCurrentPlaybackStatusStart()) return

        await startPlaybackStatus({
          itemId: nextSession.session.itemId,
          mediaSourceId: nextSession.session.mediaSourceId,
          playSessionId: nextSession.session.playSessionId,
          playMethod: nextSession.session.playMethod,
          positionTicks,
          isPaused: video?.paused ?? true,
        })

        if (isCurrentPlaybackStatusStart()) {
          activePlaybackStatusRef.current = nextSession.session
        } else if (!nextSession.stopQueuedWithKeepalive) {
          void stopPlaybackStatus({
            ...nextSession.session,
            positionTicks: nextSession.session.latestPositionTicks,
          }).catch((err) => {
            console.debug('Failed to stop stale Jellyfin playback status', err)
          })
        }
      } catch (err) {
        console.debug('Failed to start Jellyfin playback status reporting', err)
      } finally {
        if (pendingPlaybackStatusRef.current === nextSession) {
          pendingPlaybackStatusRef.current = null
        }
      }
    },
    [getActiveVideoElement],
  )

  const stopPreviousEncoding = useCallback(
    async (previousPlaySessionId: string) => {
      if (hlsEncodingPlaySessionIdRef.current === previousPlaySessionId) {
        hlsEncodingPlaySessionIdRef.current = null
      }

      try {
        await stopActiveEncoding({ playSessionId: previousPlaySessionId })
      } catch (err) {
        console.debug('Failed to stop previous Jellyfin active encoding', err)
      }
    },
    [],
  )

  const stopAllKeepalive = useCallback(() => {
    stopPlaybackStatusReportingKeepalive()

    const playSessionId = hlsEncodingPlaySessionIdRef.current
    hlsEncodingPlaySessionIdRef.current = null
    if (playSessionId) {
      stopActiveEncodingKeepalive({ playSessionId })
    }
  }, [stopPlaybackStatusReportingKeepalive])

  const reportCurrentPlaybackProgress = useEffectEvent(
    async (isPaused: boolean) => {
      const activeSession = activePlaybackStatusRef.current
      if (!currentSessionRef.current?.syncEnabled || !activeSession) return

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

  useEffect(() => {
    const activeEncodingId =
      session?.strategy === 'hls' ? session.playSessionId : null

    hlsEncodingPlaySessionIdRef.current = activeEncodingId

    return () => {
      if (
        activeEncodingId &&
        hlsEncodingPlaySessionIdRef.current === activeEncodingId
      ) {
        hlsEncodingPlaySessionIdRef.current = null

        void stopActiveEncoding({ playSessionId: activeEncodingId }).catch(
          (err) => {
            console.debug('Failed to stop Jellyfin active encoding', err)
          },
        )
      }
    }
  }, [session?.playSessionId, session?.strategy])

  useEffect(() => {
    if (!session?.syncEnabled) return

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
  }, [
    getActiveVideoElement,
    reportCurrentPlaybackProgress,
    session?.itemId,
    session?.mediaSourceId,
    session?.playSessionId,
    session?.strategy,
    session?.syncEnabled,
  ])

  return useMemo(
    () => ({
      startPlaybackStatus: startPlaybackStatusReporting,
      stopPlaybackStatus: stopPlaybackStatusReporting,
      stopAllKeepalive,
      stopPreviousEncoding,
    }),
    [
      startPlaybackStatusReporting,
      stopPlaybackStatusReporting,
      stopAllKeepalive,
      stopPreviousEncoding,
    ],
  )
}
