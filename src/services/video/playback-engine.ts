import type { BaseItemDto } from '@/types/jellyfin'
import type { PlaybackStrategy } from '@/services/video/api'
import {
  getPlaybackConfig,
  getPlaybackMediaSourceId,
} from '@/services/video/api'
import type {
  VideoPlayerError,
  VideoPlayerErrorType,
} from '@/services/video/playback-error'
import { createPlaySessionId } from '@/services/video/session'
import type {
  JellyfinSessionDescriptor,
  JellyfinStatusBackend,
  ReportedMedia,
} from '@/services/video/status-reporter'
import {
  PlaybackStatusReporter,
  jellyfinStatusBackend,
} from '@/services/video/status-reporter'
import type {
  HlsAttachment,
  HlsHealth,
  HlsPlayer,
  HlsPlayerClass,
} from '@/services/video/hls-controller'
import { attachHls } from '@/services/video/hls-controller'
import type {
  HlsReloadRequest,
  HlsTrackController,
} from '@/services/video/track-switching'
import { PlaybackTracks } from '@/services/video/playback-tracks'
import type { PlaybackTrackMedia } from '@/services/video/playback-tracks'
import { Playhead } from '@/services/video/playhead'
import type { PlayheadMedia } from '@/services/video/playhead'
import { secondsToTicks } from '@/lib/time-utils'
import { resolveFrameStepSeconds } from '@/lib/frame-rate-utils'

/** The Jellyfin calls playback makes: config resolution, play session ids and status reporting. */
export interface PlaybackBackend extends JellyfinStatusBackend {
  getPlaybackConfig: (
    item: BaseItemDto,
    audioStreamIndex: number | undefined,
    forceHls: boolean,
    playSessionId: string,
  ) => Promise<{ strategy: PlaybackStrategy; url: string }>
  createPlaySessionId: () => string
}

export const jellyfinPlaybackBackend: PlaybackBackend = {
  ...jellyfinStatusBackend,
  getPlaybackConfig: (item, audioStreamIndex, forceHls, playSessionId) =>
    getPlaybackConfig(
      item,
      undefined,
      audioStreamIndex,
      forceHls,
      playSessionId,
    ),
  createPlaySessionId,
}

/** The parts of the video element playback drives; `HTMLVideoElement` satisfies it. */
export interface PlaybackMedia
  extends ReportedMedia, PlayheadMedia, PlaybackTrackMedia {
  currentTime: number
  src: string
  readonly error: { readonly code: number } | null
  play: () => Promise<void>
  pause: () => void
  load: () => void
  removeAttribute: (name: string) => void
  canPlayType: (type: string) => string
  addEventListener: (
    type: string,
    listener: () => void,
    options?: { once?: boolean; signal?: AbortSignal },
  ) => void
}

/** Where playback stands. Errors exist only while recovering or failed. */
export type PlaybackStatus =
  | { kind: 'resolving' }
  | { kind: 'ready' }
  | { kind: 'recovering'; error: VideoPlayerError }
  | { kind: 'failed'; error: VideoPlayerError }

/** The engine's observable state; replaced, never mutated, on every change. */
export interface PlaybackSnapshot {
  /** The item `status` belongs to, or null when nothing is loaded. */
  itemId: string | null
  strategy: PlaybackStrategy
  videoUrl: string
  status: PlaybackStatus
}

/** Callbacks the host keeps current; the engine reads them when it needs them. */
export interface PlaybackHost {
  onStrategyChange?: (strategy: PlaybackStrategy) => void
  t: (key: string) => string
}

/** One (item, media source) load. Async work re-checks it is still current after every await. */
interface Load {
  item: BaseItemDto
  readonly itemId: string
  readonly mediaSourceId: string
  readonly controller: AbortController
  networkRetries: number
  /** Set once a source is applied; until then retry() resolves the config again. */
  started: boolean
}

type SessionIdentity = Omit<JellyfinSessionDescriptor, 'syncEnabled'>

const noop = () => {}

function mediaErrorType(code: number): VideoPlayerErrorType {
  switch (code) {
    case MediaError.MEDIA_ERR_NETWORK:
      return 'network_error'
    case MediaError.MEDIA_ERR_DECODE:
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'media_error'
    default:
      return 'unknown_error'
  }
}

function statusError(status: PlaybackStatus): VideoPlayerError | null {
  return status.kind === 'recovering' || status.kind === 'failed'
    ? status.error
    : null
}

function isSameError(left: VideoPlayerError, right: VideoPlayerError) {
  return (
    left.type === right.type &&
    left.message === right.message &&
    left.recoverable === right.recoverable
  )
}

/**
 * Plays one item on one video element: resolves direct play or HLS, falls
 * back from direct to HLS on errors, recovers HLS in place, carries the
 * position across source reloads, selects audio and subtitle tracks and
 * reports the session to Jellyfin.
 * Call connect() once mounted, then load() for every item change.
 */
export class PlaybackEngine<
  M extends PlaybackMedia,
  H extends HlsPlayer<M> & HlsTrackController,
> {
  readonly hlsRef: { current: H | null } = { current: null }
  readonly playhead: Playhead
  readonly tracks: PlaybackTracks

  private snapshot: PlaybackSnapshot = {
    itemId: null,
    strategy: 'hls',
    videoUrl: '',
    status: { kind: 'resolving' },
  }
  private readonly listeners = new Set<() => void>()
  private host: PlaybackHost = { t: (key) => key }
  private current: Load | null = null
  /** The applied source; direct play is an attachment without hls.js. */
  private source: HlsAttachment<H> | null = null
  /** Position and play state to restore once the next source can play. */
  private carry: { time: number; paused: boolean } | null = null
  private identity: SessionIdentity | null = null
  private syncEnabled = false
  private readonly reporter: PlaybackStatusReporter
  private untrackEncoding = noop
  private unobserve = noop

  constructor(
    private readonly backend: PlaybackBackend,
    private readonly loadHls: () => Promise<HlsPlayerClass<H>>,
    private readonly media: { readonly current: M | null },
  ) {
    this.reporter = new PlaybackStatusReporter(backend, this.getMedia, null)
    this.playhead = new Playhead(media)
    this.tracks = new PlaybackTracks(
      media,
      this.hlsRef,
      (reload) => this.reloadHlsWithUrl(reload),
      (key) => this.host.t(key),
    )
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): PlaybackSnapshot => this.snapshot

  setHost(host: PlaybackHost): void {
    this.host = host
  }

  /** Listens for pagehide and connects the playhead; the returned cleanup unloads playback. */
  connect(): () => void {
    const handlePageHide = () => {
      this.reporter.stopAllKeepalive()
    }
    window.addEventListener('pagehide', handlePageHide)
    const disconnectPlayhead = this.playhead.connect()
    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      this.load(null)
      disconnectPlayhead()
    }
  }

  /**
   * Plays `item`, or stops playing when null. The same (item, media source)
   * only swaps in the newer item object; a new media source of the same
   * item carries the position over.
   */
  load(item: BaseItemDto | null): void {
    const itemId = item?.Id
    const mediaSourceId = item ? getPlaybackMediaSourceId(item) : undefined
    const current = this.current
    const sameItem = current !== null && current.itemId === itemId
    // Follows refetched item objects too, like the editor's own frame step.
    this.playhead.frameStepSeconds = item ? resolveFrameStepSeconds(item) : 0
    if (item && sameItem && current.mediaSourceId === mediaSourceId) {
      current.item = item
      this.tracks.refresh()
      return
    }

    if (sameItem) {
      const time = this.media.current?.currentTime ?? 0
      if (!this.carry && time > 0) this.captureCarry()
    } else {
      this.carry = null
      this.playhead.reset()
    }
    this.unload()

    if (!item || !itemId || !mediaSourceId) {
      this.tracks.unload()
      this.update({ itemId: null, status: { kind: 'ready' } })
      return
    }
    this.begin(item, itemId, mediaSourceId)
  }

  /** Turns Jellyfin status reporting on or off for the current and later sessions. */
  setSyncEnabled(enabled: boolean): void {
    if (enabled === this.syncEnabled) return
    this.syncEnabled = enabled
    this.reporter.update(this.descriptor(), this.getMedia)
    this.observe()

    if (!enabled) {
      void this.reporter.stop()
    } else if (this.identity) {
      void this.reporter.start()
    }
  }

  /** Clears the error and tries again: the config if it never resolved, else the source. */
  retry = (): void => {
    const load = this.current
    if (!load) return

    if (!load.started) {
      this.begin(load.item, load.itemId, load.mediaSourceId)
      return
    }

    this.setStatus({ kind: 'ready' })
    load.networkRetries = 0
    const media = this.media.current
    if (this.snapshot.strategy === 'hls') {
      // Rebuild hls.js from scratch: after a fatal error the instance (and
      // its MediaSource) may be beyond repair. Resume from the position.
      const time = media?.currentTime ?? 0
      this.releaseSource()
      void this.startHls(load, time > 0 ? time : -1)
    } else {
      media?.load()
    }
  }

  /**
   * Switches to an HLS stream built for `playSessionId` (an audio track the
   * browser cannot select natively). Dropped if the item changes meanwhile.
   */
  reloadHlsWithUrl = async ({
    url,
    playSessionId,
  }: HlsReloadRequest): Promise<void> => {
    const load = this.current
    if (!load) return

    this.captureCarry()
    await this.reporter.stop()
    if (this.current !== load) return

    const previous =
      this.identity?.strategy === 'hls' ? this.identity.playSessionId : null
    if (previous && previous !== playSessionId) {
      await this.reporter.stopPreviousEncoding(previous)
      if (this.current !== load) return
    }

    // load() pauses without firing 'pause', which the controls listen for.
    if (this.snapshot.strategy === 'direct') this.media.current?.pause()
    this.apply(load, 'hls', url, playSessionId)
  }

  private readonly getMedia = (): M | null => this.media.current

  private begin(item: BaseItemDto, itemId: string, mediaSourceId: string) {
    const load: Load = {
      item,
      itemId,
      mediaSourceId,
      controller: new AbortController(),
      networkRetries: 0,
      started: false,
    }
    this.current = load
    this.tracks.load(load)
    this.update({ itemId, status: { kind: 'resolving' } })
    void this.resolve(load)
  }

  private async resolve(load: Load): Promise<void> {
    // Minted before the strategy is known: the HLS URL embeds it. Direct
    // play reports under a fresh id instead.
    const hlsPlaySessionId = this.backend.createPlaySessionId()
    let config: { strategy: PlaybackStrategy; url: string }
    try {
      config = await this.backend.getPlaybackConfig(
        load.item,
        this.tracks.activeAudioIndex,
        false,
        hlsPlaySessionId,
      )
    } catch (cause) {
      if (this.current !== load) return
      console.error('[Player] Init playback failed:', cause)
      this.setStatus({
        kind: 'failed',
        error: this.error('unknown_error', 'player.error.unknown'),
      })
      return
    }
    if (this.current !== load) return

    const playSessionId =
      config.strategy === 'hls'
        ? hlsPlaySessionId
        : this.backend.createPlaySessionId()
    this.apply(load, config.strategy, config.url, playSessionId)
  }

  /** Makes `url` the playing source, as a new Jellyfin play session. */
  private apply(
    load: Load,
    strategy: PlaybackStrategy,
    url: string,
    playSessionId: string,
  ) {
    const strategyChanged = !load.started || strategy !== this.snapshot.strategy
    this.releaseSource()
    load.started = true

    this.setIdentity({
      itemId: load.itemId,
      mediaSourceId: load.mediaSourceId,
      playSessionId,
      strategy,
    })
    this.update({ strategy, videoUrl: url, status: { kind: 'ready' } })
    if (strategyChanged) this.host.onStrategyChange?.(strategy)
    this.tracks.sourceApplied(strategy)
    void this.reporter.start(
      this.carry ? secondsToTicks(this.carry.time) : undefined,
    )

    const media = this.media.current
    if (!media) return
    const { signal } = load.controller
    if (this.carry) {
      media.addEventListener('canplay', this.restoreCarry, {
        once: true,
        signal,
      })
    }
    if (strategy === 'direct') {
      media.addEventListener('error', this.handleDirectError, { signal })
      media.src = url
      this.source = {
        hls: null,
        // Releases this element even after the ref detached it on unmount.
        // removeAttribute + load() aborts the download; src = '' alone may
        // keep fetching.
        detach: () => {
          media.removeAttribute('src')
          media.load()
        },
      }
    } else {
      void this.startHls(load, -1)
    }
  }

  private async startHls(load: Load, startPosition: number): Promise<void> {
    let HlsClass: HlsPlayerClass<H>
    try {
      HlsClass = await this.loadHls()
    } catch (cause) {
      // A failed chunk load; Retry imports again.
      console.error('HLS setup failed', cause)
      if (this.current === load && this.source === null) {
        this.setStatus({
          kind: 'failed',
          error: this.error('unknown_error', 'player.error.unknown'),
        })
      }
      return
    }

    // Another source may have been applied and attached during the import.
    const media = this.media.current
    if (this.current !== load || this.source !== null || !media) return
    this.source = attachHls(
      HlsClass,
      media,
      this.snapshot.videoUrl,
      startPosition,
      this.handleHlsHealth,
    )
    this.hlsRef.current = this.source.hls
  }

  private readonly handleHlsHealth = (health: HlsHealth) => {
    if (health.kind === 'ready') {
      this.setStatus({ kind: 'ready' })
    } else if (health.kind === 'recovering') {
      this.setStatus({
        kind: 'recovering',
        error: this.error(
          health.error,
          health.error === 'network_error'
            ? 'player.error.network'
            : 'player.error.media',
        ),
      })
    } else {
      this.setStatus({
        kind: 'failed',
        error: this.error('unknown_error', 'player.error.unknown'),
      })
    }
  }

  private readonly handleDirectError = () => {
    const load = this.current
    const media = this.media.current
    // Leaving direct play clears the src, whose error must not count.
    if (!load || !media?.error || this.snapshot.strategy !== 'direct') return

    const type = mediaErrorType(media.error.code)
    if (type === 'network_error' && load.networkRetries < 1) {
      load.networkRetries++
      media.load()
      return
    }

    this.setStatus({
      kind: 'failed',
      error: this.error(
        type,
        type === 'network_error'
          ? 'player.error.network'
          : type === 'media_error'
            ? 'player.error.directPlayFailed'
            : 'player.error.unknown',
        type !== 'unknown_error',
      ),
    })
    this.switchToHls(load).catch((cause: unknown) => {
      console.error('[Player] HLS fallback failed:', cause)
    })
  }

  private async switchToHls(load: Load): Promise<void> {
    this.captureCarry()
    await this.reporter.stop()

    const playSessionId = this.backend.createPlaySessionId()
    let audioStreamIndex = this.tracks.activeAudioIndex
    // A track switch while the config resolves changes what should play: a
    // native one asks for the config again, a transcoded one already left
    // direct play with the track the user picked, so the fallback stands down.
    for (;;) {
      if (this.current !== load) return
      const config = await this.backend.getPlaybackConfig(
        load.item,
        audioStreamIndex,
        true,
        playSessionId,
      )
      if (this.current !== load || this.snapshot.strategy !== 'direct') return
      if (audioStreamIndex === this.tracks.activeAudioIndex) {
        // A switch still in flight would commit over the new source.
        this.tracks.cancelSwitch()
        this.apply(load, 'hls', config.url, playSessionId)
        return
      }
      audioStreamIndex = this.tracks.activeAudioIndex
    }
  }

  private readonly restoreCarry = () => {
    const carry = this.carry
    const media = this.media.current
    if (!carry || !media) return
    this.carry = null

    if (carry.time > 0 && Number.isFinite(carry.time)) {
      media.currentTime = carry.time
    }
    if (!carry.paused) {
      media.play().catch(() => {
        // Autoplay may be blocked by browser policy.
      })
    }
  }

  private captureCarry() {
    const media = this.media.current
    if (media) this.carry = { time: media.currentTime, paused: media.paused }
  }

  private unload() {
    const load = this.current
    if (!load) return
    this.current = null
    load.controller.abort()

    this.setIdentity(null)
    // Stop before releasing the source: releasing resets the position.
    void this.reporter.stop()
    this.releaseSource()
  }

  private releaseSource() {
    const source = this.source
    this.source = null
    this.hlsRef.current = null
    source?.detach()
  }

  private setIdentity(identity: SessionIdentity | null) {
    const previous = this.identity
    this.identity = identity
    this.reporter.update(this.descriptor(), this.getMedia)

    if (
      identity?.playSessionId !== previous?.playSessionId ||
      identity?.strategy !== previous?.strategy
    ) {
      this.untrackEncoding()
      this.untrackEncoding = this.reporter.trackEncoding(identity)
      this.observe()
    }
  }

  private descriptor(): JellyfinSessionDescriptor | null {
    return this.identity && { ...this.identity, syncEnabled: this.syncEnabled }
  }

  private observe() {
    this.unobserve()
    this.unobserve =
      this.identity && this.syncEnabled ? this.reporter.observe() : noop
  }

  private error(
    type: VideoPlayerErrorType,
    messageKey: string,
    recoverable = true,
  ): VideoPlayerError {
    return { type, message: this.host.t(messageKey), recoverable }
  }

  /** An identical repeated error keeps its object, so nothing re-renders. */
  private setStatus(next: PlaybackStatus) {
    const previous = this.snapshot.status
    const previousError = statusError(previous)
    let status = next
    if (next.kind === 'recovering' || next.kind === 'failed') {
      if (previousError && isSameError(previousError, next.error)) {
        if (next.kind === previous.kind) return
        status = { kind: next.kind, error: previousError }
      }
    } else if (next.kind === previous.kind) {
      return
    }
    this.update({ status })
  }

  private update(changes: Partial<PlaybackSnapshot>) {
    this.snapshot = { ...this.snapshot, ...changes }
    this.playhead.setPlaybackReady(this.snapshot.status.kind === 'ready')
    for (const listener of this.listeners) listener()
  }
}
