import type { BaseItemDto } from '@/types/jellyfin'
import type {
  TrackSwitchOptions,
  TrackSwitchResult,
} from '@/services/video/track-switching'
import { switchSubtitleTrack } from '@/services/video/track-switching'
import type { SubtitleTrackInfo } from '@/services/video/tracks'
import type { JassubRendererResult } from '@/services/video/subtitle'
import {
  createJassubRenderer,
  preloadJassubRenderer,
  requiresJassubRenderer,
} from '@/services/video/subtitle'
import { PLAYER_CONFIG } from '@/lib/constants'
import { showError } from '@/lib/notifications'

const { RESIZE_DEBOUNCE_MS, FULLSCREEN_RESIZE_DELAY_MS } = PLAYER_CONFIG

const VIDEO_METADATA_SOFT_TIMEOUT_MS = 15_000
const VIDEO_METADATA_HARD_TIMEOUT_MS = 60_000

/** The source whose subtitles show. Its item is read when JASSUB starts, so a refetched item object wins. */
export interface SubtitleLoad {
  readonly item: BaseItemDto
  readonly mediaSourceId: string
}

/** JASSUB for one ASS/SSA stream of one load, from its start until stop(). */
interface JassubRun {
  readonly load: SubtitleLoad
  readonly streamIndex: number
  /** Aborts the start and removes the size listeners. */
  readonly controller: AbortController
  /** Null while starting and after a failed start. */
  renderer: JassubRendererResult | null
}

function waitForVideoMetadata(
  video: HTMLVideoElement,
  signal: AbortSignal,
): Promise<void> {
  if (video.readyState >= 1 && video.videoWidth > 0) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(softTimeout)
      clearTimeout(hardTimeout)
      video.removeEventListener('loadedmetadata', onLoad)
      video.removeEventListener('loadeddata', onLoad)
      video.removeEventListener('canplay', onLoad)
      video.removeEventListener('error', onError)
      signal.removeEventListener('abort', onAbort)
    }

    const onLoad = () => {
      if (video.videoWidth > 0 || video.readyState >= 1) {
        cleanup()
        resolve()
      }
    }

    const onError = () => {
      cleanup()
      reject(new Error('Video error'))
    }

    const onAbort = () => {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }

    const softTimeout = setTimeout(() => {
      if (video.readyState < 1 && !signal.aborted) {
        video.load()
      }
    }, VIDEO_METADATA_SOFT_TIMEOUT_MS)

    const hardTimeout = setTimeout(() => {
      cleanup()
      reject(new Error('Timeout waiting for video metadata'))
    }, VIDEO_METADATA_HARD_TIMEOUT_MS)

    if (signal.aborted) {
      onAbort()
      return
    }

    signal.addEventListener('abort', onAbort, { once: true })
    video.addEventListener('loadedmetadata', onLoad)
    video.addEventListener('loadeddata', onLoad)
    video.addEventListener('canplay', onLoad)
    video.addEventListener('error', onError)
  })
}

function errorMessageKey(cause: unknown): string {
  const msg = cause instanceof Error ? cause.message.toLowerCase() : ''
  if (msg.includes('timeout')) return 'player.subtitle.error.timeout'
  if (msg.includes('wasm') || msg.includes('worker'))
    return 'player.subtitle.error.wasmFailed'
  if (msg.includes('fetch') || msg.includes('network'))
    return 'player.subtitle.error.loadFailed'
  return 'player.subtitle.error.jassubInit'
}

/**
 * Shows the active subtitle of the engine's load: ASS/SSA through JASSUB
 * over hidden text tracks, every other format through its text track. It
 * owns JASSUB's lifecycle, size and the user subtitle offset.
 */
export class SubtitlePresenter {
  private offset = 0
  private readonly listeners = new Set<() => void>()
  private load: SubtitleLoad | null = null
  private run: JassubRun | null = null
  private pendingResize: {
    timer: ReturnType<typeof setTimeout>
    /** When it runs, so a later request never pulls it in. */
    deadline: number
  } | null = null

  constructor(
    private readonly media: { readonly current: HTMLVideoElement | null },
    private readonly t: (key: string) => string,
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** The user subtitle offset in seconds; positive delays the subtitles. */
  getOffset = (): number => this.offset

  /** Moves JASSUB subtitles by `offset` seconds, now and for every later start; text tracks ignore it. */
  setOffset = (offset: number): void => {
    if (offset === this.offset) return
    this.offset = offset
    // TODO: Add the transcoding offset when HLS reports it.
    this.run?.renderer?.setTimeOffset(0, offset)
    for (const listener of this.listeners) listener()
  }

  /** Presents `load`'s subtitles from its first show() on; JASSUB for the previous load stops. */
  setLoad(load: SubtitleLoad | null): void {
    this.stop()
    this.load = load
  }

  /**
   * Shows subtitle stream `index`, or none for null, resolving the text
   * track switch. JASSUB already running for that stream is kept; one still
   * starting or that failed to start starts again.
   */
  async show(
    index: number | null,
    options: TrackSwitchOptions,
  ): Promise<TrackSwitchResult> {
    const track = options.subtitleTracks?.find((t) => t.index === index)
    if (!track || !requiresJassubRenderer(track)) {
      const result = await switchSubtitleTrack(index, options)
      if (result.success) this.stop()
      return result
    }

    const result = await switchSubtitleTrack(null, options)
    this.startJassub(track)
    return result
  }

  /** Destroys JASSUB and drops a pending resize; the next show() starts it again. */
  stop(): void {
    const run = this.run
    this.run = null
    if (this.pendingResize) {
      clearTimeout(this.pendingResize.timer)
      this.pendingResize = null
    }
    run?.controller.abort()
    run?.renderer?.destroy()
  }

  private startJassub(track: SubtitleTrackInfo) {
    const { load, run } = this
    if (run?.renderer && run.load === load && run.streamIndex === track.index) {
      return
    }
    this.stop()
    const video = this.media.current
    if (!load || !video) return

    const next: JassubRun = {
      load,
      streamIndex: track.index,
      controller: new AbortController(),
      renderer: null,
    }
    this.run = next
    void this.startRenderer(next, video, track)
  }

  private async startRenderer(
    run: JassubRun,
    video: HTMLVideoElement,
    track: SubtitleTrackInfo,
  ): Promise<void> {
    const { signal } = run.controller
    try {
      await Promise.all([
        waitForVideoMetadata(video, signal),
        preloadJassubRenderer(),
      ])
      const startOffset = this.offset
      const renderer = await createJassubRenderer({
        video,
        track,
        item: run.load.item,
        mediaSourceId: run.load.mediaSourceId,
        userOffset: startOffset,
        signal,
      })
      if (this.run !== run) {
        renderer.destroy()
        return
      }
      run.renderer = renderer
      // setOffset() found no renderer to move while JASSUB was starting.
      if (this.offset !== startOffset) renderer.setTimeOffset(0, this.offset)
      this.observeSize(video, signal)
    } catch (cause) {
      if (this.run !== run) return
      const detail = cause instanceof Error ? cause.message : String(cause)
      showError(this.t(errorMessageKey(cause)), detail)
      console.error('[JASSUB] Init error:', cause)
    }
  }

  /** Resizes JASSUB to the element after layout changes, until `signal` aborts. */
  private observeSize(video: HTMLVideoElement, signal: AbortSignal) {
    const observer = new ResizeObserver(() => {
      this.scheduleResize(RESIZE_DEBOUNCE_MS)
    })
    observer.observe(video)
    document.addEventListener(
      'fullscreenchange',
      () => {
        this.scheduleResize(FULLSCREEN_RESIZE_DELAY_MS)
      },
      { signal },
    )
    signal.addEventListener('abort', () => {
      observer.disconnect()
    })
  }

  private scheduleResize(delayMs: number) {
    const deadline = Date.now() + delayMs
    const pending = this.pendingResize
    // Debounce forward only. A fullscreen transition fires ResizeObserver
    // ticks while the layout is still animating; letting their shorter delay
    // replace the pending settle deadline would measure the video mid-transition.
    if (pending && pending.deadline > deadline) return
    if (pending) clearTimeout(pending.timer)

    const timer = setTimeout(() => {
      this.pendingResize = null
      const renderer = this.run?.renderer
      const video = this.media.current
      // A source change can leave the element 0x0, on which JASSUB's worker
      // would size its OffscreenCanvas to NaN and throw.
      if (
        !renderer ||
        !video ||
        video.clientWidth <= 0 ||
        video.clientHeight <= 0
      ) {
        return
      }
      // The worker may still reject on stale dimensions; the next resize recovers.
      renderer.instance.resize().catch(() => {})
    }, delayMs)
    this.pendingResize = { timer, deadline }
  }
}
