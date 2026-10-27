import type { PlaybackStrategy } from '@/services/video/api'
import type {
  PlaybackStatusOptions,
  PlaybackStatusPlayMethod,
  StopPlaybackStatusOptions,
} from '@/services/video/playback-session'
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

/** Trailing window that coalesces a burst of seeks into one progress report. */
const SEEK_REPORT_DELAY_MS = 500
const PROGRESS_REPORT_INTERVAL_MS = 15_000

/** The Jellyfin calls status reporting makes. */
export interface JellyfinStatusBackend {
  start: (options: PlaybackStatusOptions) => Promise<void>
  progress: (options: PlaybackStatusOptions) => Promise<void>
  stop: (options: StopPlaybackStatusOptions) => Promise<void>
  /** Queued with `keepalive` so it survives the page unloading. */
  stopKeepalive: (options: StopPlaybackStatusOptions) => void
  stopEncoding: (playSessionId: string) => Promise<void>
  stopEncodingKeepalive: (playSessionId: string) => void
}

export const jellyfinStatusBackend: JellyfinStatusBackend = {
  start: (options) => startPlaybackStatus(options),
  progress: (options) => reportPlaybackProgress(options),
  stop: (options) => stopPlaybackStatus(options),
  stopKeepalive: (options) => stopPlaybackStatusKeepalive(options),
  stopEncoding: (playSessionId) => stopActiveEncoding({ playSessionId }),
  stopEncodingKeepalive: (playSessionId) =>
    stopActiveEncodingKeepalive({ playSessionId }),
}

/** The video the reporter reads positions from and listens on. */
export interface ReportedMedia {
  readonly currentTime: number
  readonly paused: boolean
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

/** The play session Jellyfin should hear about, or null when nothing plays. */
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

/**
 * Reports one player's playback to Jellyfin: start, progress and stop for the
 * current descriptor, and cleanup of the HLS transcode it started. Starts can
 * overlap descriptor changes, so a start that resolves after its descriptor
 * moved on is stopped again instead of promoted.
 */
export class PlaybackStatusReporter {
  private descriptor: JellyfinSessionDescriptor | null
  private getActiveVideoElement: () => ReportedMedia | null
  private status: PlaybackStatus = { state: 'idle' }
  private nextStartToken = 0
  /** The HLS play session whose transcode still needs stopping. */
  private hlsEncodingPlaySessionId: string | null

  constructor(
    private readonly backend: JellyfinStatusBackend,
    getActiveVideoElement: () => ReportedMedia | null,
    descriptor: JellyfinSessionDescriptor | null,
  ) {
    this.getActiveVideoElement = getActiveVideoElement
    this.descriptor = descriptor
    this.hlsEncodingPlaySessionId =
      descriptor?.strategy === 'hls' ? descriptor.playSessionId : null
  }

  /** The session Jellyfin should hear about from now on, and where its video is. */
  update(
    descriptor: JellyfinSessionDescriptor | null,
    getActiveVideoElement: () => ReportedMedia | null,
  ): void {
    this.descriptor = descriptor
    this.getActiveVideoElement = getActiveVideoElement
  }

  /** Starts reporting the current descriptor. Call after its playback config is applied. */
  start = async (positionTicksOverride?: number): Promise<void> => {
    const descriptor = this.descriptor
    if (!descriptor?.syncEnabled) return

    const status = this.status
    if (status.state === 'active') return

    const video = this.getActiveVideoElement()
    const positionTicks =
      positionTicksOverride ?? secondsToTicks(video?.currentTime ?? 0)
    if (
      status.state === 'starting' &&
      isSameSessionDescriptor(descriptor, status.descriptor)
    ) {
      status.startToken = ++this.nextStartToken
      status.session.latestPositionTicks = positionTicks
      return
    }

    const startToken = ++this.nextStartToken
    const nextStatus: StartingPlaybackStatus = {
      state: 'starting',
      descriptor,
      session: createActiveSession(descriptor, positionTicks),
      startToken,
    }
    this.status = nextStatus

    const isInitiallyPaused = video === null ? true : video.paused

    try {
      if (this.isCurrentStart(nextStatus)) {
        await this.backend.start({
          itemId: nextStatus.session.itemId,
          mediaSourceId: nextStatus.session.mediaSourceId,
          playSessionId: nextStatus.session.playSessionId,
          playMethod: nextStatus.session.playMethod,
          positionTicks,
          isPaused: isInitiallyPaused,
        })

        if (this.isCurrentStart(nextStatus)) {
          this.status = { state: 'active', session: nextStatus.session }
        } else if (!nextStatus.stopQueuedWithKeepalive) {
          void this.backend
            .stop({
              ...nextStatus.session,
              positionTicks: nextStatus.session.latestPositionTicks,
            })
            .catch((err: unknown) => {
              console.debug(
                'Failed to stop stale Jellyfin playback status',
                err,
              )
            })
        }
      }
    } catch (err) {
      console.debug('Failed to start Jellyfin playback status reporting', err)
    }

    if (this.status === nextStatus) {
      this.status = { state: 'idle' }
    }
  }

  /** Stops reporting; a start still in flight is stopped once it lands. */
  stop = async (): Promise<void> => {
    const activeStatus = this.consumeActiveStatus()
    if (!activeStatus) {
      this.invalidateStartingStatus()
      return
    }

    try {
      await this.backend.stop({
        ...activeStatus.activeSession,
        positionTicks: activeStatus.finalPositionTicks,
      })
    } catch (err) {
      console.debug('Failed to stop Jellyfin playback status reporting', err)
    }
  }

  /** Stops reporting and the transcode with keepalive requests, for pagehide. */
  stopAllKeepalive = (): void => {
    this.stopStatusKeepalive()

    const playSessionId = this.hlsEncodingPlaySessionId
    this.hlsEncodingPlaySessionId = null
    if (playSessionId) {
      this.backend.stopEncodingKeepalive(playSessionId)
    }
  }

  /** Stops the transcode of a play session this player has moved past. */
  stopPreviousEncoding = async (
    previousPlaySessionId: string,
  ): Promise<void> => {
    try {
      await this.backend.stopEncoding(previousPlaySessionId)
    } catch (err) {
      console.debug('Failed to stop previous Jellyfin active encoding', err)
    }

    if (this.hlsEncodingPlaySessionId === previousPlaySessionId) {
      this.hlsEncodingPlaySessionId = null
    }
  }

  /**
   * Tracks the transcode `descriptor` runs, if any; the returned cleanup
   * stops it unless something else already did.
   */
  trackEncoding(
    descriptor: Pick<
      JellyfinSessionDescriptor,
      'playSessionId' | 'strategy'
    > | null,
  ): () => void {
    const activeEncodingId =
      descriptor?.strategy === 'hls' ? descriptor.playSessionId : null
    this.hlsEncodingPlaySessionId = activeEncodingId

    return () => {
      if (
        activeEncodingId &&
        this.hlsEncodingPlaySessionId === activeEncodingId
      ) {
        this.hlsEncodingPlaySessionId = null
        void this.backend
          .stopEncoding(activeEncodingId)
          .catch((err: unknown) => {
            console.debug('Failed to stop Jellyfin active encoding', err)
          })
      }
    }
  }

  /**
   * Reports progress on the active video's play, pause and seeks, and every
   * 15 seconds while it plays. The returned cleanup stops listening.
   */
  observe(): () => void {
    const video = this.getActiveVideoElement()
    if (!video) return () => {}
    const handlePlaying = () => {
      void this.reportProgress(false)
    }
    const handlePause = () => {
      void this.reportProgress(true)
    }
    // Frame-stepping and key-repeat skips seek many times a second; report
    // only the position the burst settles on.
    let seekReportTimer: number | undefined
    const handleSeeked = () => {
      // Store the position now: a stop sent before the timer fires (e.g. on
      // unmount, after the video ref is gone) must still carry the seek target.
      this.currentPositionTicks()
      window.clearTimeout(seekReportTimer)
      seekReportTimer = window.setTimeout(() => {
        void this.reportProgress(video.paused)
      }, SEEK_REPORT_DELAY_MS)
    }
    const intervalId = window.setInterval(() => {
      if (!video.paused) void this.reportProgress(false)
    }, PROGRESS_REPORT_INTERVAL_MS)

    video.addEventListener('playing', handlePlaying)
    video.addEventListener('pause', handlePause)
    video.addEventListener('seeked', handleSeeked)

    return () => {
      window.clearInterval(intervalId)
      window.clearTimeout(seekReportTimer)
      video.removeEventListener('playing', handlePlaying)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('seeked', handleSeeked)
    }
  }

  private async reportProgress(isPaused: boolean): Promise<void> {
    const activeSession =
      this.status.state === 'active' ? this.status.session : null
    if (!this.descriptor?.syncEnabled || !activeSession) return

    try {
      await this.backend.progress({
        ...activeSession,
        positionTicks: this.currentPositionTicks(),
        isPaused,
      })
    } catch (err) {
      console.debug('Failed to report Jellyfin playback progress', err)
    }
  }

  /**
   * A starting status is current only while it is still installed, its token
   * is the latest, sync remains enabled, and the descriptor still matches the
   * session that issued the start request.
   */
  private isCurrentStart(starting: StartingPlaybackStatus): boolean {
    return (
      this.status === starting &&
      starting.startToken === this.nextStartToken &&
      this.descriptor?.syncEnabled === true &&
      isSameSessionDescriptor(this.descriptor, starting.descriptor)
    )
  }

  /** The video's position, also stored on the reporting session as its latest. */
  private currentPositionTicks(): number {
    const video = this.getActiveVideoElement()
    const status = this.status
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

  private consumeActiveStatus() {
    const status = this.status
    if (status.state !== 'active') return null

    const finalPositionTicks = this.currentPositionTicks()
    this.status = { state: 'idle' }

    return { activeSession: status.session, finalPositionTicks }
  }

  private invalidateStartingStatus(): void {
    const status = this.status
    if (status.state !== 'starting') return

    // Only refresh pending position from the video when it still belongs to
    // this descriptor. Stale starts must keep their original stored position.
    if (isSameSessionDescriptor(this.descriptor, status.descriptor)) {
      status.session.latestPositionTicks = this.currentPositionTicks()
    }
    // Invalidate in-flight starts without dropping the starting state; a later
    // same-descriptor start can refresh the token and reuse the request.
    this.nextStartToken++
  }

  private stopStatusKeepalive(): void {
    const activeStatus = this.consumeActiveStatus()
    if (activeStatus) {
      this.backend.stopKeepalive({
        ...activeStatus.activeSession,
        positionTicks: activeStatus.finalPositionTicks,
      })
      return
    }

    const status = this.status
    if (status.state !== 'starting') return

    // Pagehide may run after the app moved to another item. In that case, do
    // not read the current video element; it belongs to the new descriptor.
    const latestPositionTicks = status.session.latestPositionTicks
    const currentPositionTicks = isSameSessionDescriptor(
      this.descriptor,
      status.descriptor,
    )
      ? this.currentPositionTicks()
      : latestPositionTicks
    status.stopQueuedWithKeepalive = true
    this.status = { state: 'idle' }
    this.nextStartToken++

    this.backend.stopKeepalive({
      ...status.session,
      positionTicks: Math.max(currentPositionTicks, latestPositionTicks),
    })
  }
}
