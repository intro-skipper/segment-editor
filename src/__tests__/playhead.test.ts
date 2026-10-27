// @vitest-environment jsdom
/**
 * The Playhead through its interface, on a real jsdom <video>: the throttled
 * timeline, seeking and stepping, and segment skipping per skip mode.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Playhead } from '@/services/video/playhead'
import { useAppStore } from '@/stores/app-store'
import type { BaseItemDto } from '@/types/jellyfin'
import type { Segment } from '@/types/segment'
import {
  createItem,
  createPlayback,
  createVideo,
  FakeHls,
  failMedia,
  latestHls,
  settle,
} from './helpers/playback-fakes'

const intro: Segment = {
  id: 'intro',
  itemId: 'item-1',
  type: 'Intro',
  startSeconds: 10,
  endSeconds: 20,
}

/** Runs past the 100 s duration, so seeking to its end lands on the duration, inside it. */
const credits: Segment = {
  id: 'credits',
  itemId: 'item-1',
  type: 'Outro',
  startSeconds: 90,
  endSeconds: 120,
}

function setReadOnly(video: HTMLVideoElement, key: string, value: unknown) {
  Object.defineProperty(video, key, { configurable: true, value })
}

/** A connected playhead on a jsdom <video>, ready to offer skips, at frame step 0.5 s and duration 100 s. */
function createPlayhead(segments: Array<Segment> = []) {
  const video = createVideo()
  const playhead = new Playhead({ current: video })
  playhead.frameStepSeconds = 0.5
  playhead.setSegments(segments)
  playhead.setPlaybackReady(true)
  const disconnect = playhead.connect()
  setReadOnly(video, 'duration', 100)
  video.dispatchEvent(new Event('durationchange'))
  return { video, playhead, disconnect }
}

function playTo(video: HTMLVideoElement, seconds: number) {
  video.currentTime = seconds
  video.dispatchEvent(new Event('timeupdate'))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  vi.advanceTimersByTime(1000)
  useAppStore.setState({ segmentSkipMode: 'button' })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Playhead timeline', () => {
  it('publishes the position at most every 120 ms, then the latest position once the interval ends', () => {
    const { video, playhead } = createPlayhead()
    const listener = vi.fn()
    playhead.subscribe(listener)

    playTo(video, 1)
    expect(playhead.getTimeline().currentTime).toBe(1)

    vi.advanceTimersByTime(50)
    playTo(video, 1.05)
    vi.advanceTimersByTime(50)
    playTo(video, 1.1)
    video.currentTime = 1.15
    expect(playhead.getTimeline().currentTime).toBe(1)
    expect(listener).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(20)
    expect(playhead.getTimeline().currentTime).toBe(1.15)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('publishes a seek at once and drops the pending trailing publish', () => {
    const { video, playhead } = createPlayhead()
    playTo(video, 1)
    vi.advanceTimersByTime(50)
    playTo(video, 1.05)

    playhead.seek(30)
    expect(video.currentTime).toBe(30)
    expect(playhead.getTimeline().currentTime).toBe(30)

    video.currentTime = 31
    vi.advanceTimersByTime(500)
    expect(playhead.getTimeline().currentTime).toBe(30)
  })

  it('publishes the duration and the end of the last buffered range', () => {
    const { video, playhead } = createPlayhead()
    setReadOnly(video, 'buffered', {
      length: 2,
      end: (index: number) => [12, 48][index],
    })
    video.dispatchEvent(new Event('progress'))

    expect(playhead.getTimeline()).toEqual({
      currentTime: 0,
      duration: 100,
      buffered: 48,
    })
  })

  it('stops publishing once disconnected', () => {
    const { video, playhead, disconnect } = createPlayhead()
    playTo(video, 1)
    vi.advanceTimersByTime(50)
    playTo(video, 2)

    disconnect()
    vi.advanceTimersByTime(500)
    playTo(video, 3)
    expect(playhead.getTimeline().currentTime).toBe(1)
  })

  it('starts a new item at zero and steps by its frame rate', async () => {
    vi.useRealTimers()
    const { engine, video } = createPlayback()
    const { playhead } = engine
    engine.load(createItem('item-1'))
    await settle()
    setReadOnly(video, 'duration', 100)
    video.dispatchEvent(new Event('durationchange'))
    playTo(video, 40)

    engine.load({
      ...createItem('item-2'),
      MediaSources: [
        {
          Id: 'item-2-media-source',
          MediaStreams: [{ Type: 'Video', RealFrameRate: 25 }],
        },
      ],
    })
    expect(playhead.getTimeline()).toEqual({
      currentTime: 0,
      duration: 0,
      buffered: 0,
    })

    video.dispatchEvent(new Event('durationchange'))
    video.currentTime = 1
    playhead.stepFrame(-1)
    expect(video.currentTime).toBeCloseTo(0.96)
  })
})

describe('Playhead position', () => {
  it('reads the live element position, not the last published one', () => {
    const { video, playhead } = createPlayhead()
    playTo(video, 5)
    video.currentTime = 5.3

    expect(playhead.getCurrentTime()).toBe(5.3)
    expect(playhead.getSnappedTime()).toBe(5.5)
  })

  it('steps one frame from the live position, snapped and clamped to [0, duration]', () => {
    const { video, playhead } = createPlayhead()
    playTo(video, 3)
    video.currentTime = 3.1

    playhead.stepFrame(1)
    expect(video.currentTime).toBe(3.5)
    expect(playhead.getTimeline().currentTime).toBe(3.5)

    video.currentTime = 99.9
    playhead.stepFrame(1)
    expect(video.currentTime).toBe(100)

    video.currentTime = 0.2
    playhead.stepFrame(-1)
    expect(video.currentTime).toBe(0)
  })

  it('skips by the chosen size, snapped and clamped to [0, duration]', () => {
    const { video, playhead } = createPlayhead()
    const fiveSeconds = 3
    const oneFrame = 0

    video.currentTime = 40.2
    playhead.skip(1, fiveSeconds)
    expect(video.currentTime).toBe(45)

    playhead.skip(-1, oneFrame)
    expect(video.currentTime).toBe(44.5)

    video.currentTime = 97
    playhead.skip(1, fiveSeconds)
    expect(video.currentTime).toBe(100)

    video.currentTime = 3
    playhead.skip(-1, fiveSeconds)
    expect(video.currentTime).toBe(0)
  })
})

describe('Playhead segment skip', () => {
  it('offers the entered segment in button mode until it is skipped', () => {
    const { video, playhead } = createPlayhead([intro])
    const listener = vi.fn()
    playhead.subscribe(listener)

    playTo(video, 9)
    expect(playhead.getSkipOffer()).toBeNull()

    playTo(video, 12)
    expect(video.currentTime).toBe(12)
    expect(playhead.getSkipOffer()).toBe(intro)
    expect(listener).toHaveBeenCalled()

    playhead.skipSegment(intro)
    expect(video.currentTime).toBe(20)
    expect(playhead.getSkipOffer()).toBeNull()
  })

  it('withdraws the offer when playback leaves the segment', () => {
    const { video, playhead } = createPlayhead([intro])
    playTo(video, 12)
    playTo(video, 20)

    expect(playhead.getSkipOffer()).toBeNull()
  })

  it('offers the next segment when playback runs straight into it', () => {
    const recap = { ...intro, id: 'recap', startSeconds: 20, endSeconds: 30 }
    const { video, playhead } = createPlayhead([intro, recap])
    playTo(video, 12)
    playTo(video, 22)

    expect(playhead.getSkipOffer()).toBe(recap)
  })

  it('shows the offered segment as the latest segments describe it', () => {
    const { video, playhead } = createPlayhead([intro])
    playTo(video, 12)

    const outro = { ...intro, type: 'Outro' as const }
    playhead.setSegments([outro])
    expect(playhead.getSkipOffer()).toBe(outro)

    playhead.setSegments([])
    expect(playhead.getSkipOffer()).toBeNull()
  })

  it('offers nothing in disabled mode', () => {
    useAppStore.setState({ segmentSkipMode: 'disabled' })
    const { video, playhead } = createPlayhead([intro])
    playTo(video, 12)

    expect(playhead.getSkipOffer()).toBeNull()
    expect(video.currentTime).toBe(12)
  })

  it('in skip mode seeks past the segment each time playback enters it', () => {
    useAppStore.setState({ segmentSkipMode: 'skip' })
    const { video, playhead } = createPlayhead([intro])

    playTo(video, 12)
    expect(video.currentTime).toBe(20)
    expect(playhead.getTimeline().currentTime).toBe(20)
    expect(playhead.getSkipOffer()).toBeNull()

    playTo(video, 20)
    playTo(video, 15)
    expect(video.currentTime).toBe(20)
  })

  it('in skip mode seeks past a segment once even when the seek lands inside it', () => {
    useAppStore.setState({ segmentSkipMode: 'skip' })
    const { video } = createPlayhead([credits])

    playTo(video, 95)
    expect(video.currentTime).toBe(120)

    // The browser clamps that seek to the duration.
    playTo(video, 100)
    expect(video.currentTime).toBe(100)
  })

  it('re-arms when the skip mode changes', () => {
    const { video, playhead } = createPlayhead([intro, credits])
    playTo(video, 12)
    expect(playhead.getSkipOffer()).toBe(intro)

    useAppStore.getState().setSegmentSkipMode('skip')
    expect(playhead.getSkipOffer()).toBeNull()
    playTo(video, 13)
    expect(video.currentTime).toBe(20)

    playTo(video, 20)
    playTo(video, 95)
    playTo(video, 100)
    useAppStore.getState().setSegmentSkipMode('button')
    playTo(video, 100)
    expect(playhead.getSkipOffer()).toBe(credits)
  })

  it('takes the frame step from the latest object of the loaded item', () => {
    vi.useRealTimers()
    const { engine } = createPlayback()
    const withFrameRate = (fps: number): BaseItemDto => ({
      ...createItem(),
      MediaSources: [
        {
          Id: 'item-1-media-source',
          MediaStreams: [{ Type: 'Video', RealFrameRate: fps }],
        },
      ],
    })

    engine.load(withFrameRate(25))
    expect(engine.playhead.frameStepSeconds).toBe(1 / 25)
    engine.load(withFrameRate(50))
    expect(engine.playhead.frameStepSeconds).toBe(1 / 50)
  })

  it('offers no skip while playback loads or has failed', async () => {
    vi.useRealTimers()
    const { engine, video } = createPlayback({ strategy: 'direct' })
    const { playhead } = engine
    engine.load(createItem())
    playhead.setSegments([intro])
    playTo(video, 12)
    expect(playhead.getSkipOffer()).toBeNull()

    await settle()
    expect(playhead.getSkipOffer()).toBe(intro)

    failMedia(video)
    expect(engine.getSnapshot().status.kind).toBe('failed')
    expect(playhead.getSkipOffer()).toBeNull()
  })

  it('withdraws the offer while playback recovers and restores it once recovered', async () => {
    vi.useRealTimers()
    FakeHls.instances.length = 0
    const { engine, video } = createPlayback()
    const { playhead } = engine
    engine.load(createItem())
    await settle()
    const hls = latestHls()
    hls.emit(FakeHls.Events.MANIFEST_PARSED)
    playhead.setSegments([intro])
    playTo(video, 12)
    expect(playhead.getSkipOffer()).toBe(intro)

    hls.emit(FakeHls.Events.ERROR, {
      fatal: true,
      type: FakeHls.ErrorTypes.NETWORK_ERROR,
    })
    expect(engine.getSnapshot().status.kind).toBe('recovering')
    expect(playhead.getSkipOffer()).toBeNull()

    hls.emit(FakeHls.Events.FRAG_BUFFERED)
    expect(engine.getSnapshot().status.kind).toBe('ready')
    expect(playhead.getSkipOffer()).toBe(intro)
  })
})
