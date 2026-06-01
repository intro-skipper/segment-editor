import { useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react'
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

type StartingPlaybackStatus = Extract<PlaybackStatus, { state: 'starting' }>

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

function isCurrentStartingPlaybackStatus(
  currentStatus: PlaybackStatus,
  startingStatus: StartingPlaybackStatus,
  currentDescriptor: JellyfinSessionDescriptor | null,
  currentStartToken: number,
): boolean {
  // A starting status is current only while the exact object is installed, its
  // token is still the latest token, sync remains enabled, and the descriptor
  // still matches the session that issued the start request.
  return (
    currentStatus === startingStatus &&
    startingStatus.startToken === currentStartToken &&
    currentDescriptor?.syncEnabled === true &&
    isSameSessionDescriptor(currentDescriptor, startingStatus.descriptor)
  )
}

export function useJellyfinSession({
  session,
  getActiveVideoElement,
}: UseJellyfinSessionOptions): UseJellyfinSessionReturn {
  'use memo'

  const currentSessionRef = useRef<JellyfinSessionDescriptor | null>(session)
  const playbackStatusRef = useRef<PlaybackStatus>({ state: 'idle' })
  const nextStartTokenRef = useRef(0)
  // --- HLS encoding tracking (transcode lifecycle) ---
  // Playback status owns Jellyfin progress writes (start/progress/stop).
  // Encoding ref owns transcode cleanup (stopActiveEncoding).
  const hlsEncodingPlaySessionIdRef = useRef<string | null>(
    session?.strategy === 'hls' ? session.playSessionId : null,
  )

  useLayoutEffect(() => {
    currentSessionRef.current = session
  }, [session])

  const markStartingPlaybackStatusInvalid = () => {
    // Invalidate in-flight starts without dropping the starting state; a later
    // same-descriptor start can refresh the token and reuse the network request.
    nextStartTokenRef.current++
  }

  const getCurrentPositionTicks = (): number => {
    const video = getActiveVideoElement()
    const status = playbackStatusRef.current
    const sessionWithPosition =
      status.state === 'active' || status.state === 'starting'
        ? status.session
        : null
    if (video !== null) {
      const currentTicks = secondsToTicks(video.currentTime)
      if (sessionWithPosition) {
        sessionWithPosition.latestPositionTicks = currentTicks
      }
      return currentTicks
    }

    return sessionWithPosition?.latestPositionTicks ?? 0
  }

  const consumeActivePlaybackStatus = () => {
    const status = playbackStatusRef.current
    if (status.state !== 'active') return null

    const finalPositionTicks = getCurrentPositionTicks()
    playbackStatusRef.current = { state: 'idle' }

    return { activeSession: status.session, finalPositionTicks }
  }

  const invalidateStartingPlaybackStatus = () => {
    const status = playbackStatusRef.current
    if (status.state !== 'starting') return

    // Only refresh pending position from the video when it still belongs to this
    // descriptor. Stale starts must keep their original stored position.
    if (isSameSessionDescriptor(currentSessionRef.current, status.descriptor)) {
      status.session.latestPositionTicks = getCurrentPositionTicks()
    }
    markStartingPlaybackStatusInvalid()
  }

  const queueStartingPlaybackStatusKeepaliveStop = () => {
    const status = playbackStatusRef.current
    if (status.state !== 'starting') return null

    // Pagehide may run after the app moved to another item. In that case, do not
    // read the current video element; it belongs to the new descriptor.
    const latestPositionTicks = status.session.latestPositionTicks
    const currentPositionTicks = isSameSessionDescriptor(
      currentSessionRef.current,
      status.descriptor,
    )
      ? getCurrentPositionTicks()
      : latestPositionTicks
    const finalPositionTicks = Math.max(
      currentPositionTicks,
      latestPositionTicks,
    )
    status.stopQueuedWithKeepalive = true
    playbackStatusRef.current = { state: 'idle' }
    markStartingPlaybackStatusInvalid()

    return { session: status.session, finalPositionTicks }
  }

  const stopPlaybackStatusReporting = async () => {
    const activeStatus = consumeActivePlaybackStatus()
    if (!activeStatus) {
      invalidateStartingPlaybackStatus()
      return
    }

    try {
      await stopPlaybackStatus({
        ...activeStatus.activeSession,
        positionTicks: activeStatus.finalPositionTicks,
      })
    } catch (err) {
      console.debug('Failed to stop Jellyfin playback status reporting', err)
    }
  }

  const stopPlaybackStatusReportingKeepalive = () => {
    const activeStatus = consumeActivePlaybackStatus()
    if (activeStatus) {
      stopPlaybackStatusKeepalive({
        ...activeStatus.activeSession,
        positionTicks: activeStatus.finalPositionTicks,
      })
      return
    }

    const startingStatus = queueStartingPlaybackStatusKeepaliveStop()
    if (!startingStatus) return

    stopPlaybackStatusKeepalive({
      ...startingStatus.session,
      positionTicks: startingStatus.finalPositionTicks,
    })
  }

  const startPlaybackStatusReporting = async (
    positionTicksOverride?: number,
  ) => {
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

    const isInitiallyPaused = video === null ? true : video.paused

    try {
      if (isCurrentPlaybackStatusStart()) {
        await startPlaybackStatus({
          itemId: nextStatus.session.itemId,
          mediaSourceId: nextStatus.session.mediaSourceId,
          playSessionId: nextStatus.session.playSessionId,
          playMethod: nextStatus.session.playMethod,
          positionTicks,
          isPaused: isInitiallyPaused,
        })

        if (isCurrentPlaybackStatusStart()) {
          playbackStatusRef.current = {
            state: 'active',
            session: nextStatus.session,
          }
        } else if (!nextStatus.stopQueuedWithKeepalive) {
          void stopPlaybackStatus({
            ...nextStatus.session,
            positionTicks: nextStatus.session.latestPositionTicks,
          }).catch((err) => {
            console.debug('Failed to stop stale Jellyfin playback status', err)
          })
        }
      }
    } catch (err) {
      console.debug('Failed to start Jellyfin playback status reporting', err)
    }

    if (playbackStatusRef.current === nextStatus) {
      playbackStatusRef.current = { state: 'idle' }
    }
  }

  const stopPreviousEncoding = async (previousPlaySessionId: string) => {
    try {
      await stopActiveEncoding({ playSessionId: previousPlaySessionId })
    } catch (err) {
      console.debug('Failed to stop previous Jellyfin active encoding', err)
    }

    if (hlsEncodingPlaySessionIdRef.current === previousPlaySessionId) {
      hlsEncodingPlaySessionIdRef.current = null
    }
  }

  const stopAllKeepalive = () => {
    stopPlaybackStatusReportingKeepalive()

    const playSessionId = hlsEncodingPlaySessionIdRef.current
    hlsEncodingPlaySessionIdRef.current = null
    if (playSessionId) {
      stopActiveEncodingKeepalive({ playSessionId })
    }
  }

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

  return {
    startPlaybackStatus: startPlaybackStatusReporting,
    stopPlaybackStatus: stopPlaybackStatusReporting,
    stopAllKeepalive,
    stopPreviousEncoding,
  }
}
