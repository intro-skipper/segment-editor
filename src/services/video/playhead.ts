import type { Segment } from '@/types/segment'
import {
  buildSegmentTimeIndex,
  findActiveSegmentRange,
  getSegmentSkipTargetEndSeconds,
} from '@/services/video/segment-skip'
import { useAppStore } from '@/stores/app-store'
import {
  getFrameStepTargetTime,
  getSkipStepSeconds,
} from '@/lib/player-timing-utils'
import { snapToFrame } from '@/lib/time-utils'

const PUBLISH_INTERVAL_MS = 120

/** The parts of the video element the playhead reads and seeks; `HTMLVideoElement` satisfies it. */
export interface PlayheadMedia {
  currentTime: number
  readonly duration: number
  readonly buffered: {
    readonly length: number
    end: (index: number) => number
  }
  addEventListener: (
    type: string,
    listener: () => void,
    options?: { signal?: AbortSignal },
  ) => void
}

/** The published position, replaced at most every 120 ms and at once on a seek. */
export interface PlayheadTimeline {
  currentTime: number
  duration: number
  /** End of the last buffered range. */
  buffered: number
}

/**
 * Where playback stands on the timeline: publishes the position for the
 * scrubber, seeks, steps and skips, and tracks segment skipping in the app's
 * skip mode. The engine owns one and connects it with itself.
 */
export class Playhead {
  /** The frame length of the loaded source; the engine sets it per load. */
  frameStepSeconds = 0

  private timeline: PlayheadTimeline = {
    currentTime: 0,
    duration: 0,
    buffered: 0,
  }
  private readonly listeners = new Set<() => void>()
  private publishTimer: ReturnType<typeof setTimeout> | null = null
  private lastPublishAt = 0
  private segments = buildSegmentTimeIndex(undefined)
  private activeSegmentId: string | null = null
  private autoSkippedSegmentId: string | null = null
  /** The segment entered in button mode, as it was then. */
  private offer: Segment | null = null
  private playbackReady = false

  constructor(
    private readonly media: { readonly current: PlayheadMedia | null },
  ) {}

  /** One listener set for both the timeline and the skip offer. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getTimeline = (): PlayheadTimeline => this.timeline

  /**
   * The segment the skip button offers: button mode only, never while
   * playback loads or fails, and as the latest segments describe it.
   */
  getSkipOffer = (): Segment | null => {
    const offer = this.offer
    if (!offer || !this.playbackReady) return null
    return this.segments.rangeById.get(offer.id)?.segment ?? null
  }

  /** The live element position. */
  getCurrentTime = (): number => this.media.current?.currentTime ?? 0

  /** The live position snapped to the source's frames, for timestamps. */
  getSnappedTime = (): number =>
    snapToFrame(this.getCurrentTime(), this.frameStepSeconds)

  seek = (seconds: number): void => {
    const media = this.media.current
    if (!media) return

    this.clearPublishTimer()
    media.currentTime = seconds
    this.lastPublishAt = performance.now()
    this.publish({ currentTime: seconds })
  }

  stepFrame = (direction: -1 | 1): void => {
    this.seek(
      getFrameStepTargetTime(
        this.getCurrentTime(),
        direction,
        this.frameStepSeconds,
        this.timeline.duration,
      ),
    )
  }

  /** Moves by the skip size at `skipTimeIndex`, snapped, within [0, duration]. */
  skip = (direction: -1 | 1, skipTimeIndex: number): void => {
    const step = getSkipStepSeconds(skipTimeIndex, this.frameStepSeconds)
    const target = snapToFrame(
      this.getCurrentTime() + direction * step,
      this.frameStepSeconds,
    )
    this.seek(
      direction > 0
        ? Math.min(target, this.timeline.duration)
        : Math.max(target, 0),
    )
  }

  /** Seeks past `segment` and withdraws its offer. */
  skipSegment = (segment: Segment): void => {
    const range = this.segments.rangeById.get(segment.id)
    const targetEndSeconds = getSegmentSkipTargetEndSeconds(segment, range)
    if (targetEndSeconds === null) return
    this.seek(targetEndSeconds)
    this.activeSegmentId = null
    this.autoSkippedSegmentId = null
    this.setOffer(null)
  }

  setSegments(segments: ReadonlyArray<Segment> | undefined): void {
    this.segments = buildSegmentTimeIndex(segments)
    if (this.offer) this.notify()
  }

  /** Follows the element and the skip mode; the returned cleanup stops both. */
  connect(): () => void {
    const controller = new AbortController()
    const { signal } = controller
    const media = this.media.current
    media?.addEventListener('timeupdate', this.handleTimeUpdate, { signal })
    media?.addEventListener('durationchange', this.handleDurationChange, {
      signal,
    })
    media?.addEventListener('progress', this.handleProgress, { signal })

    const unsubscribe = useAppStore.subscribe((state, previous) => {
      if (
        state.segmentSkipMode !== previous.segmentSkipMode ||
        state.segmentSkipModeRevision !== previous.segmentSkipModeRevision
      ) {
        this.rearm()
      }
    })

    return () => {
      controller.abort()
      unsubscribe()
      this.clearPublishTimer()
    }
  }

  /** Starts a new item at zero. */
  reset(): void {
    this.publish({ currentTime: 0, duration: 0, buffered: 0 })
  }

  setPlaybackReady(ready: boolean): void {
    if (ready === this.playbackReady) return
    this.playbackReady = ready
    if (this.offer) this.notify()
  }

  private readonly handleTimeUpdate = () => {
    const media = this.media.current
    if (!media) return
    const time = media.currentTime
    this.trackSegments(time)

    if (this.publishTimer !== null) return
    const now = performance.now()
    const elapsed = now - this.lastPublishAt
    if (elapsed >= PUBLISH_INTERVAL_MS) {
      this.lastPublishAt = now
      this.publish({ currentTime: time })
      return
    }

    this.publishTimer = setTimeout(() => {
      this.publishTimer = null
      const latest = this.media.current?.currentTime
      if (latest === undefined) return
      this.lastPublishAt = performance.now()
      this.publish({ currentTime: latest })
    }, PUBLISH_INTERVAL_MS - elapsed)
  }

  private readonly handleDurationChange = () => {
    const media = this.media.current
    if (media) this.publish({ duration: media.duration })
  }

  private readonly handleProgress = () => {
    const buffered = this.media.current?.buffered
    if (buffered?.length) {
      this.publish({ buffered: buffered.end(buffered.length - 1) })
    }
  }

  /** Offers (button mode) or skips (skip mode) each segment once as playback enters it. */
  private trackSegments(time: number) {
    const mode = useAppStore.getState().segmentSkipMode
    const { ranges } = this.segments
    if (mode === 'disabled' || ranges.length === 0) {
      if (this.activeSegmentId !== null) this.rearm()
      return
    }

    const range = findActiveSegmentRange(ranges, time)
    const id = range?.segment.id ?? null
    if (id !== this.activeSegmentId) {
      this.activeSegmentId = id
      if (!range) this.autoSkippedSegmentId = null
      if (mode === 'button') this.setOffer(range?.segment ?? null)
    }

    if (mode === 'skip' && range && this.autoSkippedSegmentId !== id) {
      this.autoSkippedSegmentId = id
      this.seek(range.endSeconds)
    }
  }

  private rearm() {
    this.activeSegmentId = null
    this.autoSkippedSegmentId = null
    this.setOffer(null)
  }

  private setOffer(segment: Segment | null) {
    if (segment === this.offer) return
    this.offer = segment
    this.notify()
  }

  private clearPublishTimer() {
    if (this.publishTimer === null) return
    clearTimeout(this.publishTimer)
    this.publishTimer = null
  }

  private publish(changes: Partial<PlayheadTimeline>) {
    const next = { ...this.timeline, ...changes }
    if (
      Object.is(next.currentTime, this.timeline.currentTime) &&
      Object.is(next.duration, this.timeline.duration) &&
      Object.is(next.buffered, this.timeline.buffered)
    ) {
      return
    }
    this.timeline = next
    this.notify()
  }

  private notify() {
    for (const listener of this.listeners) listener()
  }
}
