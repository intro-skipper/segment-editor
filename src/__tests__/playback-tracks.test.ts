// @vitest-environment jsdom
/**
 * Audio and subtitle selection through the playback engine, on a real jsdom
 * <video> with native audio and text track lists, a fake Jellyfin backend
 * and FakeHls: the one active audio stream, single-flight switching, the
 * subtitle shown after every source change and preference persistence.
 */

import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import type { PlaybackStrategy } from '@/services/video/api'
import type * as VideoApiModule from '@/services/video/api'
import type * as TrackSwitchingModule from '@/services/video/track-switching'
import type { BaseItemDto } from '@/types/jellyfin'
import {
  applyInitialAudioTrack,
  switchAudioTrack,
} from '@/services/video/track-switching'
import { getVideoStreamUrl } from '@/services/video/api'
import { isCodecSupported } from '@/services/video/compatibility'
import { supportsNativeAudioTrackSwitching } from '@/services/video/capabilities'
import { showError } from '@/lib/notifications'
import { useAppStore } from '@/stores/app-store'
import {
  FakeHls,
  configCall,
  createPlayback,
  deferred,
  failMedia,
  settle,
} from './helpers/playback-fakes'
import type { FakeBackend } from './helpers/playback-fakes'

vi.mock('@/lib/notifications', () => ({
  showError: vi.fn(),
  showNotification: vi.fn(),
}))

vi.mock('@/services/video/capabilities', () => ({
  supportsNativeAudioTrackSwitching: vi.fn(() => true),
}))

vi.mock('@/services/video/compatibility', async (importOriginal) => {
  const { mockCompatibilityWithProbe } =
    await import('@/__tests__/helpers/audio-decodability-mock')
  return mockCompatibilityWithProbe(importOriginal)
})

vi.mock('@/services/video/api', async (importOriginal) => ({
  ...(await importOriginal<typeof VideoApiModule>()),
  getVideoStreamUrl: vi.fn(),
}))

vi.mock('@/services/video/track-switching', async (importOriginal) => {
  const actual = await importOriginal<typeof TrackSwitchingModule>()
  return {
    ...actual,
    applyInitialAudioTrack: vi.fn(actual.applyInitialAudioTrack),
    switchAudioTrack: vi.fn(actual.switchAudioTrack),
  }
})

const ENGLISH = 1
const JAPANESE = 2
const ENGLISH_COMMENTARY = 3
const SPANISH_SRT = 4
const ENGLISH_ASS = 5
const FRENCH_SRT_DEFAULT = 6

function createTracksItem(id = 'item-1'): BaseItemDto {
  return {
    Id: id,
    Name: 'Multi track item',
    Type: 'Movie',
    MediaSources: [
      {
        Id: `${id}-media-source`,
        Container: 'mkv',
        MediaStreams: [
          { Type: 'Video', Index: 0, Codec: 'h264' },
          {
            Type: 'Audio',
            Index: ENGLISH,
            Codec: 'aac',
            Language: 'eng',
            IsDefault: true,
          },
          { Type: 'Audio', Index: JAPANESE, Codec: 'aac', Language: 'jpn' },
          {
            Type: 'Audio',
            Index: ENGLISH_COMMENTARY,
            Codec: 'aac',
            Language: 'eng',
          },
          {
            Type: 'Subtitle',
            Index: SPANISH_SRT,
            Codec: 'subrip',
            Language: 'spa',
          },
          {
            Type: 'Subtitle',
            Index: ENGLISH_ASS,
            Codec: 'ass',
            Language: 'eng',
          },
          {
            Type: 'Subtitle',
            Index: FRENCH_SRT_DEFAULT,
            Codec: 'subrip',
            Language: 'fre',
            IsDefault: true,
          },
        ],
      },
    ],
  }
}

/** An item with one audio stream per codec, the first one the default. */
function codecItem(codecs: Array<string>): BaseItemDto {
  return {
    Id: 'item-1',
    Name: 'Codec item',
    Type: 'Movie',
    MediaSources: [
      {
        Id: 'item-1-media-source',
        MediaStreams: codecs.map((codec, position) => ({
          Type: 'Audio' as const,
          Index: position + 1,
          Codec: codec,
          Channels: 6,
          IsDefault: position === 0,
        })),
      },
    ],
  }
}

interface NativeAudioTrack {
  enabled: boolean
  language: string
}

/** The element's native audioTracks list; the first track starts enabled, as the container default. */
function setNativeAudioTracks(
  video: HTMLVideoElement,
  languages: Array<string>,
): Array<NativeAudioTrack> {
  const tracks = languages.map((language, position) => ({
    enabled: position === 0,
    language,
  }))
  const list = Object.assign(new EventTarget(), tracks, {
    length: tracks.length,
  })
  Object.defineProperty(video, 'audioTracks', {
    configurable: true,
    value: list,
  })
  return tracks
}

/** One text track per subtitle stream, as the caption <track>s render them. */
function setTextTracks(
  video: HTMLVideoElement,
  count: number,
): Array<{ mode: TextTrackMode }> {
  const tracks = Array.from({ length: count }, () => ({
    mode: 'disabled' as TextTrackMode,
  }))
  Object.defineProperty(video, 'textTracks', {
    configurable: true,
    value: tracks,
  })
  return tracks
}

const modes = (tracks: Array<{ mode: TextTrackMode }>) =>
  tracks.map((track) => track.mode)

const enabled = (tracks: Array<NativeAudioTrack>) =>
  tracks.map((track) => track.enabled)

interface StartOptions {
  strategy?: PlaybackStrategy
  item?: BaseItemDto
  /** Native audio track languages; null leaves the element without the API. */
  nativeAudio?: Array<string> | null
  sync?: boolean
}

/** An engine playing `item` on a <video> with native audio and text track lists. */
async function start({
  strategy = 'direct',
  item = createTracksItem(),
  nativeAudio = ['eng', 'jpn', 'eng'],
  sync = false,
}: StartOptions = {}) {
  const playback = createPlayback({ strategy, sync })
  const native = nativeAudio
    ? setNativeAudioTracks(playback.video, nativeAudio)
    : []
  const text = setTextTracks(playback.video, 3)
  playback.engine.load(item)
  await settle()
  const { tracks } = playback.engine
  return { ...playback, native, text, tracks }
}

/** Holds every later config request until the returned gate resolves. */
function holdConfig(backend: FakeBackend) {
  const gate = deferred()
  const resolve = backend.getPlaybackConfig.getMockImplementation()
  if (!resolve) throw new Error('backend has no config implementation')
  backend.getPlaybackConfig.mockImplementation(async (...args) => {
    await gate.promise
    return resolve(...args)
  })
  return gate
}

function preferences() {
  return useAppStore.getState().trackPreferences
}

beforeEach(() => {
  vi.clearAllMocks()
  FakeHls.instances.length = 0
  vi.mocked(supportsNativeAudioTrackSwitching).mockReturnValue(true)
  vi.mocked(isCodecSupported).mockReset().mockResolvedValue(true)
  vi.mocked(getVideoStreamUrl)
    .mockReset()
    .mockImplementation(
      (options, audioStreamIndex) =>
        `https://jellyfin.example/Videos/${options.itemId}/master.m3u8?PlaySessionId=${options.playSessionId}&AudioStreamIndex=${audioStreamIndex}`,
    )
  const store = useAppStore.getState()
  store.setPreferredAudioLanguage(null)
  store.setPreferredSubtitleLanguage(null)
  store.setSubtitlesEnabled(false)
})

describe('initial audio stream', () => {
  it('starts on the preferred language, read once per load for both the config and the menu', async () => {
    useAppStore.getState().setPreferredAudioLanguage('jpn')
    const { engine, backend, tracks } = await start({ strategy: 'hls' })

    expect(configCall(backend, 0).audioStreamIndex).toBe(JAPANESE)
    expect(tracks.getState().activeAudioIndex).toBe(JAPANESE)

    // A preference changed mid-session neither reloads nor moves the track.
    useAppStore.getState().setPreferredAudioLanguage('eng')
    engine.load(createTracksItem())
    await settle()
    expect(backend.getPlaybackConfig).toHaveBeenCalledTimes(1)
    expect(tracks.getState().activeAudioIndex).toBe(JAPANESE)

    engine.load(createTracksItem('item-2'))
    await settle()
    expect(configCall(backend, 1)).toMatchObject({
      item: expect.objectContaining({ Id: 'item-2' }),
      audioStreamIndex: ENGLISH,
    })
    expect(tracks.getState().activeAudioIndex).toBe(ENGLISH)
  })

  it('starts on the container default when no track has the preferred language', async () => {
    useAppStore.getState().setPreferredAudioLanguage('kor')
    const { backend, tracks } = await start()

    expect(configCall(backend, 0).audioStreamIndex).toBe(ENGLISH)
    expect(tracks.getState().activeAudioIndex).toBe(ENGLISH)
  })

  it('enables a non-default track natively once direct play has metadata, and again after a reload', async () => {
    useAppStore.getState().setPreferredAudioLanguage('jpn')
    const { engine, video, backend, native } = await start()
    expect(enabled(native)).toEqual([true, false, false])

    video.dispatchEvent(new Event('loadedmetadata'))
    await settle()
    expect(enabled(native)).toEqual([false, true, false])
    expect(backend.getPlaybackConfig).toHaveBeenCalledTimes(1)
    expect(engine.getSnapshot().strategy).toBe('direct')

    // A direct reload (Retry) starts the file on its default track again.
    native[0].enabled = true
    native[1].enabled = false
    video.dispatchEvent(new Event('loadedmetadata'))
    await settle()
    expect(enabled(native)).toEqual([false, true, false])
  })

  it('never applies a native track to an HLS stream', async () => {
    useAppStore.getState().setPreferredAudioLanguage('jpn')
    const { video, native, tracks } = await start({ strategy: 'hls' })

    video.dispatchEvent(new Event('loadedmetadata'))
    expect(tracks.getState().switching).toBe(false)
    await settle()

    expect(applyInitialAudioTrack).not.toHaveBeenCalled()
    expect(enabled(native)).toEqual([true, false, false])
  })

  it('shows the failure and the container default when the initial track cannot be applied', async () => {
    useAppStore.getState().setPreferredAudioLanguage('jpn')
    // Undecodable natively: the switch has to transcode, and the URL fails.
    const { video, tracks } = await start()
    vi.mocked(isCodecSupported).mockResolvedValue(false)
    vi.mocked(getVideoStreamUrl).mockReturnValueOnce('')

    video.dispatchEvent(new Event('loadedmetadata'))
    await settle()

    expect(showError).toHaveBeenCalledWith(
      'player.tracks.error.switchFailed',
      'Failed to generate HLS URL for audio track switching',
    )
    expect(tracks.getState()).toMatchObject({
      activeAudioIndex: ENGLISH,
      switching: false,
    })
  })

  it('drops an initial application still in flight on unmount', async () => {
    useAppStore.getState().setPreferredAudioLanguage('jpn')
    const { video, backend, native, disconnect } = await start()
    const probe = deferred<boolean>()
    vi.mocked(isCodecSupported).mockReturnValue(probe.promise)

    video.dispatchEvent(new Event('loadedmetadata'))
    const { signal } = vi.mocked(applyInitialAudioTrack).mock.calls[0][1]
    expect(signal?.aborted).toBe(false)

    disconnect()
    expect(signal?.aborted).toBe(true)
    probe.resolve(true)
    await settle()

    expect(enabled(native)).toEqual([true, false, false])
    expect(backend.getPlaybackConfig).toHaveBeenCalledTimes(1)
    expect(showError).not.toHaveBeenCalled()
  })
})

describe('selectAudio', () => {
  it('switches direct play natively without reloading and persists the language', async () => {
    const { engine, backend, native, tracks } = await start()

    await expect(tracks.selectAudio(JAPANESE)).resolves.toBe(true)

    expect(enabled(native)).toEqual([false, true, false])
    expect(tracks.getState()).toMatchObject({
      activeAudioIndex: JAPANESE,
      switching: false,
    })
    expect(preferences().preferredAudioLanguage).toBe('jpn')
    expect(backend.getPlaybackConfig).toHaveBeenCalledTimes(1)
    expect(engine.getSnapshot().strategy).toBe('direct')
  })

  it('restarts an HLS session as a transcode of the chosen track', async () => {
    const { engine, tracks } = await start({ strategy: 'hls' })

    await expect(tracks.selectAudio(JAPANESE)).resolves.toBe(true)
    await settle()

    expect(engine.getSnapshot().videoUrl).toContain(
      `AudioStreamIndex=${JAPANESE}`,
    )
    expect(tracks.getState().activeAudioIndex).toBe(JAPANESE)
    expect(preferences().preferredAudioLanguage).toBe('jpn')
  })

  it('keeps the exact track when another track shares its persisted language', async () => {
    const { engine, backend, tracks } = await start()

    await tracks.selectAudio(ENGLISH_COMMENTARY)
    expect(preferences().preferredAudioLanguage).toBe('eng')
    engine.load(createTracksItem())
    await settle()

    expect(tracks.getState().activeAudioIndex).toBe(ENGLISH_COMMENTARY)
    expect(backend.getPlaybackConfig).toHaveBeenCalledTimes(1)
  })

  it('applies the persisted language to the next item', async () => {
    const { engine, backend, tracks } = await start()
    await tracks.selectAudio(JAPANESE)

    engine.load(createTracksItem('item-2'))
    await settle()

    expect(configCall(backend, 1)).toMatchObject({
      item: expect.objectContaining({ Id: 'item-2' }),
      audioStreamIndex: JAPANESE,
    })
  })

  it('keeps the track and the preference when the switch fails', async () => {
    const { tracks } = await start({ strategy: 'hls' })
    vi.mocked(getVideoStreamUrl).mockReturnValueOnce('')

    await expect(tracks.selectAudio(JAPANESE)).resolves.toBe(false)

    expect(showError).toHaveBeenCalledWith(
      'player.tracks.error.switchFailed',
      'Failed to generate HLS URL with audio track',
    )
    expect(tracks.getState()).toMatchObject({
      activeAudioIndex: ENGLISH,
      switching: false,
    })
    expect(preferences().preferredAudioLanguage).toBeNull()
  })

  it('resolves false with the failure toast when the switch throws', async () => {
    const { tracks } = await start({ strategy: 'hls' })
    vi.mocked(getVideoStreamUrl).mockImplementationOnce(() => {
      throw new Error('boom')
    })

    await expect(tracks.selectAudio(JAPANESE)).resolves.toBe(false)

    expect(showError).toHaveBeenCalledWith(
      'player.tracks.error.switchFailed',
      'boom',
    )
    expect(tracks.getState().switching).toBe(false)
    expect(preferences().preferredAudioLanguage).toBeNull()
  })

  it('drops a switch still in flight when the item changes', async () => {
    const { engine, native, tracks } = await start()
    const probe = deferred<boolean>()
    vi.mocked(isCodecSupported).mockReturnValue(probe.promise)

    const switching = tracks.selectAudio(JAPANESE)
    engine.load(createTracksItem('item-2'))
    probe.resolve(true)

    await expect(switching).resolves.toBe(false)
    await settle()
    expect(enabled(native)).toEqual([true, false, false])
    expect(tracks.getState()).toMatchObject({
      activeAudioIndex: ENGLISH,
      switching: false,
    })
    expect(preferences().preferredAudioLanguage).toBeNull()
    expect(showError).not.toHaveBeenCalled()
  })
})

describe('one track switch at a time', () => {
  it('refuses selections while a switch runs, including one in the same turn', async () => {
    const { text, native, tracks } = await start()
    const probe = deferred<boolean>()
    vi.mocked(isCodecSupported).mockReturnValue(probe.promise)

    const first = tracks.selectAudio(JAPANESE)
    const second = tracks.selectAudio(ENGLISH_COMMENTARY)
    expect(tracks.getState().switching).toBe(true)
    await expect(second).resolves.toBe(false)
    await expect(tracks.selectSubtitle(SPANISH_SRT)).resolves.toBe(false)
    expect(switchAudioTrack).toHaveBeenCalledTimes(1)

    probe.resolve(true)
    await expect(first).resolves.toBe(true)
    expect(enabled(native)).toEqual([false, true, false])
    expect(modes(text)).toEqual(['disabled', 'disabled', 'disabled'])
    expect(tracks.getState()).toMatchObject({
      activeAudioIndex: JAPANESE,
      activeSubtitleIndex: null,
      switching: false,
    })
  })

  it('holds the lock through the initial audio application', async () => {
    useAppStore.getState().setPreferredAudioLanguage('jpn')
    const { video, native, tracks } = await start()
    const probe = deferred<boolean>()
    vi.mocked(isCodecSupported).mockReturnValue(probe.promise)

    video.dispatchEvent(new Event('loadedmetadata'))
    expect(tracks.getState().switching).toBe(true)
    await expect(tracks.selectAudio(ENGLISH_COMMENTARY)).resolves.toBe(false)
    await expect(tracks.selectSubtitle(SPANISH_SRT)).resolves.toBe(false)
    expect(switchAudioTrack).not.toHaveBeenCalled()

    // A reload re-firing loadedmetadata mid-application starts no second one.
    video.dispatchEvent(new Event('loadedmetadata'))
    expect(applyInitialAudioTrack).toHaveBeenCalledTimes(1)
    expect(tracks.getState().switching).toBe(true)

    probe.resolve(true)
    await settle()
    expect(enabled(native)).toEqual([false, true, false])
    expect(tracks.getState()).toMatchObject({
      activeAudioIndex: JAPANESE,
      activeSubtitleIndex: null,
      switching: false,
    })
  })
})

describe('refetched item', () => {
  it('re-reads the tracks without restarting playback or dropping the subtitle', async () => {
    const store = useAppStore.getState()
    store.setSubtitlesEnabled(true)
    store.setPreferredSubtitleLanguage('spa')
    const { engine, backend, tracks } = await start()
    expect(tracks.getState().activeSubtitleIndex).toBe(SPANISH_SRT)

    const item = createTracksItem()
    const source = item.MediaSources?.[0]
    engine.load({
      ...item,
      MediaSources: [
        {
          ...source,
          MediaStreams: [
            ...(source?.MediaStreams ?? []),
            { Type: 'Subtitle', Index: 7, Codec: 'subrip', Language: 'ger' },
          ],
        },
      ],
    })

    expect(tracks.getState().subtitleTracks.map((t) => t.index)).toContain(7)
    expect(tracks.getState().activeSubtitleIndex).toBe(SPANISH_SRT)
    expect(backend.getPlaybackConfig).toHaveBeenCalledTimes(1)
  })
})

describe('direct play error fallback', () => {
  it('restarts as HLS on the audio stream playing now', async () => {
    const { engine, video, backend, tracks } = await start()
    await tracks.selectAudio(ENGLISH_COMMENTARY)

    failMedia(video)
    await settle()

    expect(configCall(backend, 1)).toMatchObject({
      audioStreamIndex: ENGLISH_COMMENTARY,
      forceHls: true,
    })
    expect(engine.getSnapshot().videoUrl).toContain(
      `AudioStreamIndex=${ENGLISH_COMMENTARY}`,
    )
  })

  it('asks again for the track switched natively while the fallback resolves', async () => {
    const { engine, video, backend, tracks } = await start()
    const gate = holdConfig(backend)

    failMedia(video)
    await settle()
    await tracks.selectAudio(JAPANESE)
    gate.resolve()
    await settle()

    expect(configCall(backend, 2)).toMatchObject({
      audioStreamIndex: JAPANESE,
      forceHls: true,
    })
    expect(engine.getSnapshot().videoUrl).toContain(
      `AudioStreamIndex=${JAPANESE}`,
    )
  })

  it('keeps a transcoded track switch made while the fallback resolves', async () => {
    vi.mocked(supportsNativeAudioTrackSwitching).mockReturnValue(false)
    const { engine, video, backend, tracks } = await start({
      nativeAudio: null,
    })
    const gate = holdConfig(backend)

    failMedia(video)
    await settle()
    await tracks.selectAudio(JAPANESE)
    const switched = engine.getSnapshot().videoUrl
    gate.resolve()
    await settle()

    expect(switched).toContain(`AudioStreamIndex=${JAPANESE}`)
    expect(engine.getSnapshot().videoUrl).toBe(switched)
    expect(tracks.activeAudioIndex).toBe(JAPANESE)
  })

  it('cancels a switch still in flight once it falls back', async () => {
    const { engine, video, tracks } = await start()
    const probe = deferred<boolean>()
    vi.mocked(isCodecSupported).mockReturnValue(probe.promise)

    const pending = tracks.selectAudio(JAPANESE)
    failMedia(video)
    await settle()
    probe.resolve(true)

    expect(await pending).toBe(false)
    expect(tracks.activeAudioIndex).toBe(ENGLISH)
    expect(preferences().preferredAudioLanguage).toBeNull()
    expect(engine.getSnapshot().videoUrl).toContain(
      `AudioStreamIndex=${ENGLISH}`,
    )
  })

  it('drops a transcoded switch whose status stop the fallback overtook', async () => {
    vi.mocked(supportsNativeAudioTrackSwitching).mockReturnValue(false)
    const { engine, video, backend, tracks } = await start({
      nativeAudio: null,
      sync: true,
    })
    const stopping = deferred()
    backend.stop.mockReturnValueOnce(stopping.promise)

    const pending = tracks.selectAudio(JAPANESE)
    await settle()
    failMedia(video)
    await settle()
    stopping.resolve()

    expect(await pending).toBe(false)
    expect(tracks.activeAudioIndex).toBe(ENGLISH)
    expect(engine.getSnapshot().videoUrl).toContain(
      `AudioStreamIndex=${ENGLISH}`,
    )
  })

  it('restarts as HLS on the initial audio stream before any switch', async () => {
    useAppStore.getState().setPreferredAudioLanguage('jpn')
    const { video, backend } = await start()

    failMedia(video)
    await settle()

    expect(configCall(backend, 1)).toMatchObject({
      audioStreamIndex: JAPANESE,
      forceHls: true,
    })
  })

  it('drops an initial application still waiting for native tracks', async () => {
    useAppStore.getState().setPreferredAudioLanguage('jpn')
    // One native track: the application waits for the list to populate.
    const { engine, video, backend, tracks } = await start({
      nativeAudio: ['eng'],
    })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    onTestFinished(() => {
      vi.useRealTimers()
    })

    video.dispatchEvent(new Event('loadedmetadata'))
    await vi.advanceTimersByTimeAsync(0)
    failMedia(video)
    await vi.advanceTimersByTimeAsync(0)
    expect(tracks.getState().switching).toBe(false)

    // Past the native track-list wait: the HLS session is not restarted.
    await vi.advanceTimersByTimeAsync(5000)
    expect(backend.getPlaybackConfig).toHaveBeenCalledTimes(2)
    expect(backend.stopEncoding).not.toHaveBeenCalled()
    expect(FakeHls.instances).toHaveLength(1)
    expect(engine.getSnapshot().videoUrl).toContain(
      `AudioStreamIndex=${JAPANESE}`,
    )
    expect(showError).not.toHaveBeenCalled()
  })
})

describe('audio switch transcode hint', () => {
  async function scope(codecs: Array<string>, strategy?: PlaybackStrategy) {
    const { tracks } = await start({ strategy, item: codecItem(codecs) })
    return tracks.getState().audioSwitchTranscodeScope
  }

  it('is none for HLS playback', async () => {
    expect(await scope(['aac', 'dts'], 'hls')).toBe('none')
  })

  it('is all without the native switching API', async () => {
    vi.mocked(supportsNativeAudioTrackSwitching).mockReturnValue(false)
    expect(await scope(['aac', 'aac'])).toBe('all')
  })

  it('is none when every target decodes natively', async () => {
    expect(await scope(['aac', 'aac'])).toBe('none')
    expect(isCodecSupported).toHaveBeenCalled()
  })

  it('counts a listed codec the decoder probe rejects', async () => {
    vi.mocked(isCodecSupported).mockImplementation(async (codec) =>
      Promise.resolve(codec.toLowerCase() !== 'eac3'),
    )
    expect(await scope(['aac', 'eac3'])).toBe('all')
  })

  it('is some when only part of the targets transcode', async () => {
    expect(await scope(['aac', 'aac', 'dts'])).toBe('some')
  })

  it('leaves the active track out', async () => {
    // With the DTS track playing, the AAC target switches natively.
    expect(await scope(['dts', 'aac'])).toBe('none')
  })
})

describe('subtitles', () => {
  it('start off unless enabled, even with a preferred language', async () => {
    useAppStore.getState().setPreferredSubtitleLanguage('spa')
    const { text, tracks } = await start()

    expect(tracks.getState().activeSubtitleIndex).toBeNull()
    expect(modes(text)).toEqual(['disabled', 'disabled', 'disabled'])
  })

  it.each<PlaybackStrategy>(['direct', 'hls'])(
    'show the preferred text subtitle at playback start (%s)',
    async (strategy) => {
      useAppStore.getState().setSubtitlesEnabled(true)
      useAppStore.getState().setPreferredSubtitleLanguage('spa')
      const { text, tracks } = await start({ strategy })

      expect(tracks.getState().activeSubtitleIndex).toBe(SPANISH_SRT)
      expect(modes(text)).toEqual(['showing', 'disabled', 'disabled'])
    },
  )

  it('start on the default subtitle when none has the preferred language', async () => {
    useAppStore.getState().setSubtitlesEnabled(true)
    useAppStore.getState().setPreferredSubtitleLanguage('kor')
    const { text, tracks } = await start()

    expect(tracks.getState().activeSubtitleIndex).toBe(FRENCH_SRT_DEFAULT)
    expect(modes(text)).toEqual(['disabled', 'disabled', 'showing'])
  })

  it('keep showing after direct play falls back to HLS', async () => {
    useAppStore.getState().setSubtitlesEnabled(true)
    useAppStore.getState().setPreferredSubtitleLanguage('spa')
    const { engine, video, text } = await start()
    // Whatever reset the text tracks, the next source shows the selection.
    text[0].mode = 'disabled'

    failMedia(video)
    await settle()

    expect(engine.getSnapshot().strategy).toBe('hls')
    expect(modes(text)).toEqual(['showing', 'disabled', 'disabled'])
  })

  it('keep showing after a transcoded audio reload', async () => {
    const { engine, text, tracks } = await start({ nativeAudio: null })
    await tracks.selectSubtitle(SPANISH_SRT)
    text[0].mode = 'disabled'

    await expect(tracks.selectAudio(JAPANESE)).resolves.toBe(true)

    expect(engine.getSnapshot().videoUrl).toContain(
      `AudioStreamIndex=${JAPANESE}`,
    )
    expect(modes(text)).toEqual(['showing', 'disabled', 'disabled'])
  })

  it('selects a text subtitle, then none, persisting each', async () => {
    const { text, tracks } = await start()

    await expect(tracks.selectSubtitle(SPANISH_SRT)).resolves.toBe(true)
    expect(modes(text)).toEqual(['showing', 'disabled', 'disabled'])
    expect(tracks.getState().activeSubtitleIndex).toBe(SPANISH_SRT)
    expect(preferences()).toMatchObject({
      subtitlesEnabled: true,
      preferredSubtitleLanguage: 'spa',
    })

    await expect(tracks.selectSubtitle(null)).resolves.toBe(true)
    expect(modes(text)).toEqual(['disabled', 'disabled', 'disabled'])
    expect(tracks.getState().activeSubtitleIndex).toBeNull()
    expect(preferences()).toMatchObject({
      subtitlesEnabled: false,
      preferredSubtitleLanguage: 'spa',
    })
  })

  it('keep the selection and the preferences when a subtitle has no text track', async () => {
    const { video, tracks } = await start()
    setTextTracks(video, 2)

    await expect(tracks.selectSubtitle(FRENCH_SRT_DEFAULT)).resolves.toBe(false)

    expect(showError).toHaveBeenCalledWith(
      'player.tracks.error.switchFailed',
      `Subtitle track with index ${FRENCH_SRT_DEFAULT} has no text track`,
    )
    expect(tracks.getState().activeSubtitleIndex).toBeNull()
    expect(preferences().subtitlesEnabled).toBe(false)
  })

  it('toggle off, then on with the first track, persisting both', async () => {
    useAppStore.getState().setSubtitlesEnabled(true)
    useAppStore.getState().setPreferredSubtitleLanguage('fre')
    const { text, tracks } = await start()
    expect(tracks.getState().activeSubtitleIndex).toBe(FRENCH_SRT_DEFAULT)

    tracks.toggleSubtitles()
    await settle()
    expect(tracks.getState().activeSubtitleIndex).toBeNull()
    expect(preferences().subtitlesEnabled).toBe(false)

    tracks.toggleSubtitles()
    await settle()
    expect(tracks.getState().activeSubtitleIndex).toBe(SPANISH_SRT)
    expect(modes(text)).toEqual(['showing', 'disabled', 'disabled'])
    expect(preferences()).toMatchObject({
      subtitlesEnabled: true,
      preferredSubtitleLanguage: 'spa',
    })
  })
})
