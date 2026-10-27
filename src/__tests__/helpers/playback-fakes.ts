import { onTestFinished, vi } from 'vitest'
import type { BaseItemDto } from '@/types/jellyfin'
import type { PlaybackStrategy } from '@/services/video/api'
import type { HlsPlayer, HlsPlayerClass } from '@/services/video/hls-controller'
import type {
  PlaybackBackend,
  PlaybackHost,
} from '@/services/video/playback-engine'
import { PlaybackEngine } from '@/services/video/playback-engine'

/** A promise plus the handles that settle it, for ordering async steps. */
export interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (cause: unknown) => void
}

export function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Lets every pending promise chain run to its end. */
export const settle = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve)
  })

export function createItem(id = 'item-1'): BaseItemDto {
  return {
    Id: id,
    Name: 'Test Item',
    Type: 'Movie',
    MediaSources: [{ Id: `${id}-media-source` }],
  }
}

/**
 * A Jellyfin backend that records every call. The first resolution of an
 * item returns `strategy`; a forced one is always HLS, with the play session
 * and audio stream in its URL. Session ids are `ps-1`, `ps-2`, …
 */
export function fakeBackend(strategy: PlaybackStrategy) {
  let minted = 0
  return {
    getPlaybackConfig: vi.fn<PlaybackBackend['getPlaybackConfig']>(
      async (item, audioStreamIndex, forceHls, playSessionId) =>
        forceHls || strategy === 'hls'
          ? {
              strategy: 'hls',
              url: `https://jellyfin.example/Videos/${item.Id}/master.m3u8?PlaySessionId=${playSessionId}&AudioStreamIndex=${audioStreamIndex}`,
            }
          : {
              strategy: 'direct',
              url: `https://jellyfin.example/Videos/${item.Id}/stream`,
            },
    ),
    createPlaySessionId: vi.fn<PlaybackBackend['createPlaySessionId']>(
      () => `ps-${++minted}`,
    ),
    start: vi.fn<PlaybackBackend['start']>(async () => {}),
    progress: vi.fn<PlaybackBackend['progress']>(async () => {}),
    stop: vi.fn<PlaybackBackend['stop']>(async () => {}),
    stopKeepalive: vi.fn<PlaybackBackend['stopKeepalive']>(),
    stopEncoding: vi.fn<PlaybackBackend['stopEncoding']>(async () => {}),
    stopEncodingKeepalive: vi.fn<PlaybackBackend['stopEncodingKeepalive']>(),
  } satisfies PlaybackBackend
}

export type FakeBackend = ReturnType<typeof fakeBackend>

/** The `n`th getPlaybackConfig call (0-based) by name. */
export function configCall(backend: FakeBackend, n: number) {
  const call = backend.getPlaybackConfig.mock.calls.at(n)
  if (!call) throw new Error(`getPlaybackConfig was not called ${n + 1} times`)
  const [item, audioStreamIndex, forceHls, playSessionId] = call
  return { item, audioStreamIndex, forceHls, playSessionId }
}

/** What hls.js passes to an event listener. */
interface FakeHlsEventData {
  fatal: boolean
  type: string
}

type FakeHlsListener = (event: string, data: FakeHlsEventData) => void

/** hls.js stand-in that records what playback asks of it; tests emit its events. */
export class FakeHls implements HlsPlayer<HTMLVideoElement> {
  static readonly instances: Array<FakeHls> = []
  static readonly Events = {
    ERROR: 'hlsError',
    MANIFEST_PARSED: 'hlsManifestParsed',
    FRAG_BUFFERED: 'hlsFragBuffered',
  }
  static readonly ErrorTypes = {
    NETWORK_ERROR: 'networkError',
    MEDIA_ERROR: 'mediaError',
  }
  static isSupported = () => true

  readonly listeners = new Map<string, Set<FakeHlsListener>>()
  /** Jellyfin playlists carry one muxed audio rendition, so this stays empty. */
  audioTracks: Array<{ lang?: string; name?: string }> = []
  audioTrack = -1
  destroyed = false
  media: HTMLVideoElement | null = null
  loadedUrls: Array<string> = []
  recoverCalls = 0
  swapAudioCodecCalls = 0
  startLoadCalls = 0

  constructor(readonly config: { startPosition: number }) {
    FakeHls.instances.push(this)
  }
  attachMedia(media: HTMLVideoElement) {
    this.media = media
  }
  loadSource(url: string) {
    this.loadedUrls.push(url)
  }
  on(event: string, listener: FakeHlsListener) {
    const listeners = this.listeners.get(event) ?? new Set()
    listeners.add(listener)
    this.listeners.set(event, listeners)
  }
  /** Detaches the media as hls.js does, which resets its position. */
  destroy() {
    this.destroyed = true
    this.listeners.clear()
    this.media?.removeAttribute('src')
    this.media?.load()
    this.media = null
  }
  recoverMediaError() {
    this.recoverCalls++
  }
  swapAudioCodec() {
    this.swapAudioCodecCalls++
  }
  startLoad() {
    this.startLoadCalls++
  }
  emit(event: string, data: FakeHlsEventData = { fatal: false, type: '' }) {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      listener(event, data)
    }
  }
}

/** The newest FakeHls instance. */
export function latestHls(): FakeHls {
  const hls = FakeHls.instances.at(-1)
  if (!hls) throw new Error('No Hls instance was created')
  return hls
}

interface PlaybackOptions {
  /** What the first config resolution returns. Defaults to HLS. */
  strategy?: PlaybackStrategy
  sync?: boolean
  host?: Partial<PlaybackHost>
  loadHls?: () => Promise<HlsPlayerClass<FakeHls>>
}

/** Sets the element's play state, which jsdom keeps read-only. */
export function setPaused(video: HTMLMediaElement, paused: boolean) {
  Object.defineProperty(video, 'paused', { configurable: true, value: paused })
}

/**
 * A jsdom <video> whose load() resets the position and pauses, as the media
 * load algorithm does; play() only records, pause() only pauses.
 */
export function createVideo(): HTMLVideoElement {
  const video = document.createElement('video')
  video.load = vi.fn(() => {
    video.currentTime = 0
    setPaused(video, true)
  })
  video.play = vi.fn(async () => {})
  video.pause = vi.fn(() => {
    setPaused(video, true)
  })
  return video
}

/**
 * A connected engine on a createVideo() element, a fake backend and FakeHls.
 * It disconnects when the test finishes.
 */
export function createPlayback(options: PlaybackOptions = {}) {
  const video = createVideo()
  const media: { current: HTMLVideoElement | null } = { current: video }
  const backend = fakeBackend(options.strategy ?? 'hls')
  const engine = new PlaybackEngine(
    backend,
    options.loadHls ?? (async () => FakeHls),
    media,
  )
  engine.setHost({ t: (key) => key, ...options.host })
  const disconnect = engine.connect()
  onTestFinished(disconnect)
  engine.setSyncEnabled(options.sync ?? false)
  return { engine, video, media, backend, disconnect }
}

/** Fires a media `error` on the element, as the browser would. */
export function failMedia(
  video: HTMLVideoElement,
  code: number = MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED,
) {
  Object.defineProperty(video, 'error', { configurable: true, value: { code } })
  video.dispatchEvent(new Event('error'))
}
