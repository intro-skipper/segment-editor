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
type StartingPlaybackStatus = Extract<PlaybackStatus, { state: 'starting' }>

type PlaybackStatus =
  | { state: 'idle' }
  | {
      state: 'starting'
      descriptor: JellyfinSessionDescriptor
      session: ActivePlaybackStatusSession
      startToken: number
      stopQueuedWithKeepalive?: boolean
    }
  | {
      state: 'active'
      session: ActivePlaybackStatusSession
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

function isSameSessionDescriptor(
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

function createPlaybackStatusPayload(
  session: ActivePlaybackStatusSession,
  positionTicks: number,
  isPaused: boolean,
) {
  return {
    itemId: session.itemId,
    mediaSourceId: session.mediaSourceId,
    playSessionId: session.playSessionId,
    playMethod: session.playMethod,
    positionTicks,
    isPaused,
  }
}

function isCurrentStartingPlaybackStatus(
  currentStatus: PlaybackStatus,
  startingStatus: StartingPlaybackStatus,
  currentDescriptor: JellyfinSessionDescriptor | null,
  currentStartToken: number,
): boolean {
  return (
    currentStatus === startingStatus &&
    startingStatus.startToken === currentStartToken &&
    currentDescriptor?.syncEnabled === true &&
    isSameSessionDescriptor(currentDescriptor, startingStatus.descriptor)
  )
}

function promoteStartingPlaybackStatus(
  startingStatus: StartingPlaybackStatus,
): PlaybackStatus {
  return {
    state: 'active',
    session: startingStatus.session,
  }
}

export function useJellyfinSession({
  session,
  getActiveVideoElement,
}: UseJellyfinSessionOptions): UseJellyfinSessionReturn {
  const currentSessionRef = useRef<JellyfinSessionDescriptor | null>(session)
  const playbackStatusRef = useRef<PlaybackStatus>({ state: 'idle' })
  const nextStartTokenRef = useRef(0)
  // --- HLS encoding tracking (transcode lifecycle) ---
  // Playback status owns Jellyfin progress writes (start/progress/stop).
  // Encoding ref owns transcode cleanup (stopActiveEncoding).
  const hlsEncodingPlaySessionIdRef = useRef<string | null>(
    session?.strategy === 'hls' ? session.playSessionId : null,
  )

  currentSessionRef.current = session

  const markStartingPlaybackStatusInvalid = useCallback(() => {
    nextStartTokenRef.current++
  }, [])

  const getCurrentPositionTicks = useCallback((): number => {
    const video = getActiveVideoElement()
    const status = playbackStatusRef.current
    const activeSession = status.state === 'active' ? status.session : null
    if (video !== null) {
      const currentTicks = secondsToTicks(video.currentTime)
      if (activeSession) activeSession.latestPositionTicks = currentTicks
      return currentTicks
    }

    return activeSession?.latestPositionTicks ?? 0
  }, [getActiveVideoElement])

  const consumeActiveStatus = useCallback(() => {
    const status = playbackStatusRef.current
    const activeSession = status.state === 'active' ? status.session : null
    const finalPositionTicks = getCurrentPositionTicks()
    if (status.state === 'active') {
      playbackStatusRef.current = { state: 'idle' }
    } else if (status.state === 'starting') {
      markStartingPlaybackStatusInvalid()
    }

    return { activeSession, finalPositionTicks }
  }, [getCurrentPositionTicks, markStartingPlaybackStatusInvalid])

  const stopPlaybackStatusReporting = useCallback(async () => {
    const { activeSession, finalPositionTicks } = consumeActiveStatus()
    if (!activeSession) return

    try {
      await stopPlaybackStatus({
        ...activeSession,
        positionTicks: finalPositionTicks,
      })
    } catch (err) {
      console.debug('Failed to stop Jellyfin playback status reporting', err)
    }
  }, [consumeActiveStatus])

  const stopPlaybackStatusReportingKeepalive = useCallback(() => {
    const previousStatus = playbackStatusRef.current
    const { activeSession, finalPositionTicks } = consumeActiveStatus()
    if (activeSession) {
      stopPlaybackStatusKeepalive({
        ...activeSession,
        positionTicks: finalPositionTicks,
      })
      return
    }

    if (previousStatus.state !== 'starting') return

    previousStatus.stopQueuedWithKeepalive = true
    playbackStatusRef.current = { state: 'idle' }
    stopPlaybackStatusKeepalive({
      ...previousStatus.session,
      positionTicks: Math.max(
        finalPositionTicks,
        previousStatus.session.latestPositionTicks,
      ),
    })
  }, [consumeActiveStatus])

  const startPlaybackStatusReporting = useCallback(
    async (positionTicksOverride?: number) => {
      const descriptor = currentSessionRef.current
      if (!descriptor?.syncEnabled) return

      const status = playbackStatusRef.current
      if (status.state === 'active') {
        return
      }

      const video = getActiveVideoElement()
      const positionTicks =
        positionTicksOverride ?? secondsToTicks(video?.currentTime ?? 0)
      if (
        status.state === 'starting' &&
        isSameSessionDescriptor(descriptor, status.descriptor)
      ) {
        status.startToken = ++nextStartTokenRef.current
        status.session.latestPositionTicks = positionTicks
        return
      }

      const startToken = ++nextStartTokenRef.current
      const nextStatus: StartingPlaybackStatus = {
        state: 'starting',
        descriptor,
        session: createActiveSession(descriptor, positionTicks),
        startToken,
      }
      playbackStatusRef.current = nextStatus

      const isCurrentPlaybackStatusStart = () =>
        isCurrentStartingPlaybackStatus(
          playbackStatusRef.current,
          nextStatus,
          currentSessionRef.current,
          nextStartTokenRef.current,
        )

      try {
        if (!isCurrentPlaybackStatusStart()) return

        await startPlaybackStatus({
          ...createPlaybackStatusPayload(
            nextStatus.session,
            positionTicks,
            video?.paused ?? true,
          ),
        })

        if (isCurrentPlaybackStatusStart()) {
          playbackStatusRef.current = promoteStartingPlaybackStatus(nextStatus)
        } else if (!nextStatus.stopQueuedWithKeepalive) {
          void stopPlaybackStatus({
            ...nextStatus.session,
            positionTicks: nextStatus.session.latestPositionTicks,
          }).catch((err) => {
            console.debug('Failed to stop stale Jellyfin playback status', err)
          })
        }
      } catch (err) {
        console.debug('Failed to start Jellyfin playback status reporting', err)
      } finally {
        if (playbackStatusRef.current === nextStatus) {
          playbackStatusRef.current = { state: 'idle' }
        }
      }
    },
    [getActiveVideoElement],
  )

  const stopPreviousEncoding = useCallback(
    async (previousPlaySessionId: string) => {
      try {
        await stopActiveEncoding({ playSessionId: previousPlaySessionId })
      } catch (err) {
        console.debug('Failed to stop previous Jellyfin active encoding', err)
      } finally {
        if (hlsEncodingPlaySessionIdRef.current === previousPlaySessionId) {
          hlsEncodingPlaySessionIdRef.current = null
        }
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
      const status = playbackStatusRef.current
      const activeSession = status.state === 'active' ? status.session : null
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
