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
import { PLAYER_CONFIG } from '@/lib/constants'
import { useSessionStore } from '@/stores/session-store'

const { PLAYBACK_SPEEDS, DEFAULT_PLAYBACK_SPEED_INDEX } = PLAYER_CONFIG

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
  volume: number
  muted: boolean
  playbackRate: number
  defaultPlaybackRate: number
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
  paused: boolean
  volume: number
  muted: boolean
  /** Index into PLAYBACK_SPEEDS. */
  speedIndex: number
}

/** Callbacks the host keeps current; the engine reads them when it needs them. */
export interface PlaybackHost {
  /** Direct play gave way to HLS within one load: the fallback or a transcoded audio track. */
  onSwitchedToTranscode?: () => void
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

function initialSnapshot(): PlaybackSnapshot {
  const { playerVolume, playerMuted } = useSessionStore.getState()
  return {
    itemId: null,
    strategy: 'hls',
    videoUrl: '',
    status: { kind: 'resolving' },
    paused: true,
    volume: playerVolume,
    muted: playerMuted,
    speedIndex: DEFAULT_PLAYBACK_SPEED_INDEX,
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
 * position across source reloads, selects audio and subtitle tracks, owns
 * volume, mute and speed (persisting volume and mute) and reports the
 * session to Jellyfin.
 * load() says what to play; it plays while the element is connected and
 * resumes where it was when the element connects again.
 */
export class PlaybackEngine<
  M extends PlaybackMedia,
  H extends HlsPlayer<M> & HlsTrackController,
> {
  readonly hlsRef: { current: H | null } = { current: null }
  readonly playhead: Playhead
  readonly tracks: PlaybackTracks

  private snapshot: PlaybackSnapshot = initialSnapshot()
  private readonly listeners = new Set<() => void>()
  private host: PlaybackHost = { t: (key) => key }
  /** The item load() last asked for; connect() starts it. */
  private wanted: BaseItemDto | null = null
  private connected = false
  private current: Load | null = null
  /** The applied source; direct play is an attachment without hls.js. */
  private source: HlsAttachment<H> | null = null
  /** Position and play state to restore once the next source can play. */
  private carry: { time: number; paused: boolean } | null = null
  /** Counts applied sources, so a reload can tell another one landed first. */
  private sourceRevision = 0
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

  /**
   * Applies volume, mute and speed to the element, follows its play state and
   * volume, listens for pagehide, connects the playhead and plays the wanted
   * item; the returned cleanup unloads it, keeping its position for the next
   * connect().
   */
  connect(): () => void {
    const controller = new AbortController()
    const { signal } = controller
    window.addEventListener(
      'pagehide',
      () => {
        this.reporter.stopAllKeepalive()
      },
      { signal },
    )
    const media = this.media.current
    if (media) {
      media.volume = this.snapshot.volume
      media.muted = this.snapshot.muted
      this.applySpeed()
      media.addEventListener('play', this.syncPaused, { signal })
      media.addEventListener('pause', this.syncPaused, { signal })
      // Releasing or reloading a source pauses without firing 'pause'.
      media.addEventListener('emptied', this.syncPaused, { signal })
      // Native controls (iOS fullscreen) change volume behind our back.
      media.addEventListener('volumechange', this.syncVolume, { signal })
      this.syncPaused()
    }
    const disconnectPlayhead = this.playhead.connect()
    this.connected = true
    if (this.wanted) this.play(this.wanted)
    return () => {
      controller.abort()
      this.detach()
      disconnectPlayhead()
    }
  }

  /**
   * Plays `item`, or stops playing when null; while disconnected it only
   * records it. The same (item, media source) only swaps in the newer item
   * object; a new media source of the same item carries the position and
   * speed over, and another item starts from the beginning at the default
   * speed.
   */
  load(item: BaseItemDto | null): void {
    if (item?.Id !== this.wanted?.Id) {
      this.carry = null
      this.playhead.reset()
      this.setSpeedIndex(DEFAULT_PLAYBACK_SPEED_INDEX)
    }
    this.wanted = item
    if (this.connected) this.play(item)
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

  togglePlay = (): void => {
    const media = this.media.current
    if (!media) return
    if (media.paused) {
      media.play().catch(() => {
        // Rejected by autoplay policy or a source change; errors surface
        // through the media error path.
      })
    } else {
      media.pause()
    }
  }

  /** Sets the volume; 0 mutes and anything louder unmutes. */
  setVolume = (volume: number): void => {
    const media = this.media.current
    if (!media) return
    media.volume = volume
    media.muted = volume === 0
    this.syncVolume()
  }

  toggleMute = (): void => {
    const media = this.media.current
    if (!media) return
    media.muted = !media.muted
    this.syncVolume()
  }

  /** Plays at PLAYBACK_SPEEDS[index], clamped to the list, from now on and after every source reload. */
  setSpeedIndex = (index: number): void => {
    const speedIndex = Math.max(0, Math.min(PLAYBACK_SPEEDS.length - 1, index))
    if (speedIndex !== this.snapshot.speedIndex) this.update({ speedIndex })
    this.applySpeed()
  }

  cycleSpeed = (direction: 1 | -1): void => {
    this.setSpeedIndex(this.snapshot.speedIndex + direction)
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
    // Another source applied while this waits (the HLS fallback) wins.
    const source = this.sourceRevision
    const superseded = () =>
      this.current !== load || this.sourceRevision !== source

    this.captureCarry()
    await this.reporter.stop()
    if (superseded()) return

    const previous =
      this.identity?.strategy === 'hls' ? this.identity.playSessionId : null
    if (previous && previous !== playSessionId) {
      await this.reporter.stopPreviousEncoding(previous)
      if (superseded()) return
    }

    this.apply(load, 'hls', url, playSessionId)
  }

  private readonly getMedia = (): M | null => this.media.current

  private readonly syncPaused = () => {
    // A 'pause' queued by removing the element must not lose the play state
    // detach() carries.
    const media = this.media.current
    if (media && media.paused !== this.snapshot.paused) {
      this.update({ paused: media.paused })
    }
  }

  /** Publishes and persists the element's volume and mute. */
  private readonly syncVolume = () => {
    const media = this.media.current
    if (!media) return
    const { volume, muted } = media
    if (volume === this.snapshot.volume && muted === this.snapshot.muted) return
    this.update({ volume, muted })
    const { setPlayerVolume, setPlayerMuted } = useSessionStore.getState()
    setPlayerVolume(volume)
    setPlayerMuted(muted)
  }

  /**
   * Every source change runs the media load algorithm, which resets
   * playbackRate to defaultPlaybackRate; setting both keeps the speed across
   * the HLS fallback, audio reloads and Retry.
   */
  private applySpeed() {
    const media = this.media.current
    if (!media) return
    const rate = PLAYBACK_SPEEDS[this.snapshot.speedIndex]
    media.defaultPlaybackRate = rate
    media.playbackRate = rate
  }

  private play(item: BaseItemDto | null) {
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

    const media = this.media.current
    // A version switch keeps playing even before the first frame (time 0).
    const progressed =
      media !== null && (media.currentTime > 0 || !media.paused)
    if (sameItem && !this.carry && progressed) this.captureCarry()
    this.unload()

    if (!item || !itemId || !mediaSourceId) {
      this.tracks.unload()
      this.update({ itemId: null, status: { kind: 'ready' } })
      return
    }
    this.begin(item, itemId, mediaSourceId)
  }

  /**
   * Unloads after React let go of the element, so the position comes from
   * the playhead and the play state from the snapshot. The speed lasts only
   * as long as the element.
   */
  private detach() {
    this.connected = false
    if (this.current?.started) {
      this.carry ??= {
        time: this.playhead.getTimeline().currentTime,
        paused: this.snapshot.paused,
      }
    }
    this.unload()
    this.setSpeedIndex(DEFAULT_PLAYBACK_SPEED_INDEX)
  }

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
    const switchedToTranscode =
      load.started && this.snapshot.strategy === 'direct' && strategy === 'hls'
    this.sourceRevision++
    this.releaseSource()
    load.started = true

    this.setIdentity({
      itemId: load.itemId,
      mediaSourceId: load.mediaSourceId,
      playSessionId,
      strategy,
    })
    this.update({ strategy, videoUrl: url, status: { kind: 'ready' } })
    if (switchedToTranscode) this.host.onSwitchedToTranscode?.()
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
      // Published at once, so a detach before the next timeupdate keeps it.
      this.playhead.seek(carry.time)
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
