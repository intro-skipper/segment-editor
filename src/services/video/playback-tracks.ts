import type { BaseItemDto } from '@/types/jellyfin'
import type { PlaybackStrategy } from '@/services/video/api'
import type {
  HlsReloadRequest,
  HlsTrackController,
  TrackMedia,
  TrackSwitchOptions,
  TrackSwitchResult,
} from '@/services/video/track-switching'
import {
  applyInitialAudioTrack,
  switchAudioTrack,
  switchSubtitleTrack,
} from '@/services/video/track-switching'
import type {
  AudioTrackInfo,
  SubtitleTrackInfo,
  TrackState,
} from '@/services/video/tracks'
import {
  extractTracks,
  findPreferredAudioStreamIndex,
  getContainerDefaultAudioTrack,
} from '@/services/video/tracks'
import { supportsNativeAudioTrackSwitching } from '@/services/video/capabilities'
import {
  isAudioTrackDecodable,
  isAudioTrackDirectPlayable,
} from '@/services/video/compatibility'
import {
  preloadJassubRenderer,
  requiresJassubRenderer,
} from '@/services/video/subtitle'
import { showError } from '@/lib/notifications'
import { languagesMatch } from '@/lib/language-utils'
import { useAppStore } from '@/stores/app-store'

/**
 * Whether selecting a different audio track restarts the stream as a
 * transcode, over every audio track except the active one of a direct-played
 * file: 'all', 'some', or 'none' (also for HLS and single-track items).
 */
export type AudioSwitchTranscodeScope = 'none' | 'some' | 'all'

/** The track menu's state. Replaced, never mutated, on every change. */
export interface PlaybackTrackState extends TrackState {
  audioSwitchTranscodeScope: AudioSwitchTranscodeScope
  /** A switch or the initial audio application runs; new selections are refused until it ends. */
  switching: boolean
}

/** The media element surface track selection uses; `HTMLVideoElement` satisfies it. */
export interface PlaybackTrackMedia extends TrackMedia {
  addEventListener: (
    type: string,
    listener: () => void,
    options?: { signal?: AbortSignal },
  ) => void
}

/** The engine's load the selection belongs to. */
interface TrackLoad {
  readonly item: BaseItemDto
  readonly itemId: string
  readonly mediaSourceId: string
  readonly controller: AbortController
}

type Outcome = 'switched' | 'failed' | 'skipped'

const EMPTY_STATE: PlaybackTrackState = {
  audioTracks: [],
  subtitleTracks: [],
  activeAudioIndex: undefined,
  activeSubtitleIndex: null,
  audioSwitchTranscodeScope: 'none',
  switching: false,
}

function findPreferredSubtitleIndex(
  subtitleTracks: ReadonlyArray<SubtitleTrackInfo>,
  preferredLanguage: string | null,
  subtitlesEnabled: boolean,
): number | null {
  if (!subtitlesEnabled) return null

  if (preferredLanguage) {
    const preferredTrack = subtitleTracks.find((track) =>
      languagesMatch(track.language, preferredLanguage),
    )
    if (preferredTrack) return preferredTrack.index
  }

  return subtitleTracks.find((track) => track.isDefault)?.index ?? null
}

function audioSwitchTranscodeScope(
  strategy: PlaybackStrategy,
  audioTracks: ReadonlyArray<AudioTrackInfo>,
  activeAudioIndex: number | undefined,
  decodable: ReadonlySet<number> | null,
): AudioSwitchTranscodeScope {
  if (strategy !== 'direct' || audioTracks.length <= 1) return 'none'

  const native = supportsNativeAudioTrackSwitching()
  // Until the decoder probe resolves, the static allowlist answers alone:
  // the first gate the switch itself applies.
  const transcodes = (track: AudioTrackInfo) =>
    !native ||
    !isAudioTrackDirectPlayable(track.codec) ||
    (decodable !== null && !decodable.has(track.index))

  const targets = audioTracks.filter(
    (track) => track.index !== activeAudioIndex,
  )
  const transcoding = targets.filter(transcodes).length
  if (transcoding === 0) return 'none'
  return transcoding === targets.length ? 'all' : 'some'
}

/**
 * Audio and subtitle selection for the engine's loads. It owns the active
 * audio stream (decided once per load from the preferences, then changed only
 * by a successful switch), runs one switch at a time, shows the selected text
 * subtitle after every source change and persists a preference only once its
 * switch succeeded.
 */
export class PlaybackTracks {
  private state: PlaybackTrackState = EMPTY_STATE
  private readonly listeners = new Set<() => void>()
  private current: TrackLoad | null = null
  /** Audio indices that passed the decoder probe; null until it resolves. */
  private decodable: ReadonlySet<number> | null = null
  private strategy: PlaybackStrategy = 'hls'
  /** Aborted when playback leaves direct play: a stale initial application must not enable a track or restart the transcode. */
  private initialAudio = new AbortController()

  constructor(
    private readonly media: { readonly current: PlaybackTrackMedia | null },
    private readonly hls: { readonly current: HlsTrackController | null },
    private readonly reloadHls: (reload: HlsReloadRequest) => Promise<void>,
    private readonly t: (key: string) => string,
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getState = (): PlaybackTrackState => this.state

  /** The audio stream that plays: the config input and what the HLS fallback restarts on. */
  get activeAudioIndex(): number | undefined {
    return this.state.activeAudioIndex
  }

  /** Starts a load's selection from the persisted preferences. */
  load(load: TrackLoad): void {
    const { audioTracks, subtitleTracks } = extractTracks(load.item)
    const preferences = useAppStore.getState().trackPreferences
    this.current = load
    this.decodable = null
    this.set({
      audioTracks,
      subtitleTracks,
      activeAudioIndex: findPreferredAudioStreamIndex(
        audioTracks,
        preferences.preferredAudioLanguage,
      ),
      activeSubtitleIndex: findPreferredSubtitleIndex(
        subtitleTracks,
        preferences.preferredSubtitleLanguage,
        preferences.subtitlesEnabled,
      ),
      switching: false,
    })
  }

  unload(): void {
    this.current = null
    this.decodable = null
    this.set(EMPTY_STATE)
  }

  /**
   * Called for every source the engine applies: shows the selected subtitle,
   * and for direct play applies the active audio stream once metadata loads
   * (the file starts on its container default).
   */
  sourceApplied(strategy: PlaybackStrategy): void {
    this.strategy = strategy
    if (strategy !== 'direct') {
      this.initialAudio.abort()
      this.initialAudio = new AbortController()
    }
    this.set({})
    const load = this.current
    const media = this.media.current
    if (!load || !media) return

    void switchSubtitleTrack(
      this.state.activeSubtitleIndex,
      this.options(media, load),
    )
    if (strategy !== 'direct') return

    // Stays subscribed: a direct reload (Retry, network retry) starts the
    // file on its default track again.
    media.addEventListener('loadedmetadata', this.applyActiveAudio, {
      signal: load.controller.signal,
    })
    void this.probeDecoders(load)
  }

  /** Switches to audio stream `index`; resolves false when refused or failed (a failure shows a toast). */
  selectAudio = async (index: number): Promise<boolean> => {
    const load = this.current
    const media = this.media.current
    if (!load || !media) return false

    const track = this.state.audioTracks.find((t) => t.index === index)
    if (!track) {
      showError(this.t('player.tracks.error.trackNotFound'))
      return false
    }
    if (index === this.state.activeAudioIndex) return false

    const outcome = await this.run(
      load,
      () => switchAudioTrack(index, this.options(media, load)),
      () => {
        this.set({ activeAudioIndex: index })
        if (track.language) {
          useAppStore.getState().setPreferredAudioLanguage(track.language)
        }
      },
    )
    return outcome === 'switched'
  }

  /** Shows subtitle stream `index`, or none for null; resolves false when refused or failed. */
  selectSubtitle = async (index: number | null): Promise<boolean> => {
    const load = this.current
    const media = this.media.current
    if (!load || !media) return false

    const track =
      index === null
        ? null
        : this.state.subtitleTracks.find((t) => t.index === index)
    if (track === undefined) {
      showError(this.t('player.tracks.error.trackNotFound'))
      return false
    }
    if (index === this.state.activeSubtitleIndex) return false

    if (track && requiresJassubRenderer(track)) {
      void preloadJassubRenderer().catch(() => {})
    }

    const outcome = await this.run(
      load,
      () => switchSubtitleTrack(index, this.options(media, load)),
      () => {
        this.set({ activeSubtitleIndex: index })
        const preferences = useAppStore.getState()
        preferences.setSubtitlesEnabled(track !== null)
        if (track?.language) {
          preferences.setPreferredSubtitleLanguage(track.language)
        }
      },
    )
    return outcome === 'switched'
  }

  /** The subtitle hotkey: turns subtitles off, or on with the first track. */
  toggleSubtitles = (): void => {
    const { activeSubtitleIndex, subtitleTracks } = this.state
    if (activeSubtitleIndex !== null) {
      void this.selectSubtitle(null)
    } else if (subtitleTracks.length > 0) {
      void this.selectSubtitle(subtitleTracks[0].index)
    }
  }

  private readonly applyActiveAudio = () => {
    const load = this.current
    const media = this.media.current
    const index = this.state.activeAudioIndex
    const defaultIndex = getContainerDefaultAudioTrack(
      this.state.audioTracks,
    )?.index
    if (
      !load ||
      !media ||
      this.strategy !== 'direct' ||
      index === undefined ||
      index === defaultIndex
    ) {
      return
    }

    const signal = AbortSignal.any([
      load.controller.signal,
      this.initialAudio.signal,
    ])
    void this.run(
      load,
      () =>
        applyInitialAudioTrack(index, { ...this.options(media, load), signal }),
      () => {},
    ).then((outcome) => {
      // The element still plays the container default: show that.
      if (outcome === 'failed' && this.current === load) {
        this.set({ activeAudioIndex: defaultIndex })
      }
    })
  }

  /**
   * Runs one switch at a time: a call while another switch (or the initial
   * audio application) runs is skipped. Commits only a switch that succeeded
   * for the still-current load; a failure shows a toast.
   */
  private async run(
    load: TrackLoad,
    operation: () => Promise<TrackSwitchResult>,
    commit: () => void,
  ): Promise<Outcome> {
    if (this.state.switching) return 'skipped'
    this.set({ switching: true })
    const { signal } = load.controller
    try {
      const result = await operation()
      if (signal.aborted) return 'skipped'
      if (result.success) {
        commit()
        return 'switched'
      }
      this.reportFailure(result.error.message)
    } catch (cause) {
      if (signal.aborted) return 'skipped'
      this.reportFailure(cause instanceof Error ? cause.message : '')
    } finally {
      if (this.current === load) this.set({ switching: false })
    }
    return 'failed'
  }

  private reportFailure(detail: string) {
    showError(this.t('player.tracks.error.switchFailed'), detail || undefined)
  }

  /** Resolves the transcode hint through the same decoder probe the switch runs. */
  private async probeDecoders(load: TrackLoad): Promise<void> {
    const { audioTracks } = this.state
    if (audioTracks.length <= 1 || !supportsNativeAudioTrackSwitching()) return
    try {
      const results = await Promise.all(
        audioTracks.map(async (track) => ({
          index: track.index,
          decodable: await isAudioTrackDecodable(track),
        })),
      )
      if (this.current !== load) return
      this.decodable = new Set(
        results.filter((r) => r.decodable).map((r) => r.index),
      )
      this.set({})
    } catch (cause) {
      // The static allowlist stays the answer for this load.
      console.error('[PlaybackTracks] Audio decoder probe failed:', cause)
    }
  }

  private options(media: TrackMedia, load: TrackLoad): TrackSwitchOptions {
    return {
      strategy: this.strategy,
      videoElement: media,
      hlsInstance: this.hls.current,
      itemId: load.itemId,
      mediaSourceId: load.mediaSourceId,
      audioTracks: this.state.audioTracks,
      subtitleTracks: this.state.subtitleTracks,
      onReloadHls: this.reloadHls,
      signal: load.controller.signal,
    }
  }

  /** Recomputes the transcode hint; an unchanged state keeps its object, so nothing re-renders. */
  private set(changes: Partial<PlaybackTrackState>) {
    const next = { ...this.state, ...changes }
    next.audioSwitchTranscodeScope = audioSwitchTranscodeScope(
      this.strategy,
      next.audioTracks,
      next.activeAudioIndex,
      this.decodable,
    )
    const previous = this.state
    if (
      (Object.keys(next) as Array<keyof PlaybackTrackState>).every((key) =>
        Object.is(next[key], previous[key]),
      )
    ) {
      return
    }
    this.state = next
    for (const listener of this.listeners) listener()
  }
}
