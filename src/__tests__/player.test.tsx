// @vitest-environment jsdom
/**
 * The real Player under the editor's playback owner, whose Jellyfin calls and
 * hls.js are faked: clicking its controls and pressing its shortcuts drives
 * the <video>, the engine's state and the persisted settings. In the real
 * PlayerEditor, playback outlives a version switch and the player being
 * hidden.
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import type { ComponentProps } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'

import { asElement } from './helpers/dom'
import { isTranslationOptions, resolveTranslation } from './helpers/i18n-mock'
import type { TranslationArg, TranslationOptions } from './helpers/i18n-mock'
import {
  FakeHls,
  createItem,
  deferred,
  failMedia,
  latestHls,
  setPaused,
  settle,
} from './helpers/playback-fakes'
import type { BaseItemDto, MediaSegmentDto } from '@/types/jellyfin'
import type { PlaybackStrategy } from '@/services/video/api'
import type * as VideoApiModule from '@/services/video/api'
import type * as SubtitleModule from '@/services/video/subtitle'
import type * as NotificationsModule from '@/lib/notifications'
import { getPlaybackConfig } from '@/services/video/api'
import {
  startPlaybackStatus,
  stopPlaybackStatus,
} from '@/services/video/playback-session'
import { stopActiveEncoding } from '@/services/video/transcode-session'
import { showNotification } from '@/lib/notifications'
import { Player } from '@/components/player/Player'
import { PlayerEditor } from '@/components/player/PlayerEditor'
import { PlaybackProvider } from '@/components/player/playback-context'
import { usePlaybackSession } from '@/hooks/use-playback-session'
import { useApiStore } from '@/stores/api-store'
import { useAppStore } from '@/stores/app-store'
import { useSessionStore } from '@/stores/session-store'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, arg?: TranslationArg, params?: TranslationOptions) => {
      if (key.startsWith('segmentType.')) return key.slice(12)
      if (key === 'player.skipSegment' && isTranslationOptions(arg)) {
        return `Skip ${arg.type}`
      }
      return resolveTranslation(
        key,
        typeof arg === 'string' && params
          ? { ...params, defaultValue: arg }
          : arg,
      )
    },
  }),
}))

vi.mock('hls.js', async () => ({
  default: (await import('./helpers/playback-fakes')).FakeHls,
}))

vi.mock('@/services/video/api', async (importOriginal) => ({
  ...(await importOriginal<typeof VideoApiModule>()),
  getPlaybackConfig: vi.fn(),
  getVideoStreamUrl: vi.fn(
    (options: { itemId: string }, audioStreamIndex?: number) =>
      `https://jellyfin.example/Videos/${options.itemId}/master.m3u8?AudioStreamIndex=${audioStreamIndex}`,
  ),
  getBestImageUrl: () => null,
}))

vi.mock('@/services/video/playback-session', () => ({
  reportPlaybackProgress: vi.fn(() => Promise.resolve()),
  startPlaybackStatus: vi.fn(() => Promise.resolve()),
  stopPlaybackStatus: vi.fn(() => Promise.resolve()),
  stopPlaybackStatusKeepalive: vi.fn(),
}))

const { setTimeOffset } = vi.hoisted(() => ({
  setTimeOffset:
    vi.fn<(transcodingTicks: number, userOffset: number) => void>(),
}))

// The JASSUB renderer (a worker and WASM) stands in for ASS subtitles only.
vi.mock('@/services/video/subtitle', async (importOriginal) => ({
  ...(await importOriginal<typeof SubtitleModule>()),
  preloadJassubRenderer: () => Promise.resolve(),
  createJassubRenderer: () =>
    Promise.resolve({
      instance: { resize: () => {} },
      destroy: () => {},
      setTimeOffset,
      setTrack: () => Promise.resolve(),
    }),
}))

vi.mock('@/lib/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof NotificationsModule>()),
  showNotification: vi.fn(),
}))

vi.mock('@/services/video/transcode-session', () => ({
  stopActiveEncoding: vi.fn(() => Promise.resolve()),
  stopActiveEncodingKeepalive: vi.fn(),
}))

const ENGLISH = 1
const JAPANESE = 2
const SPANISH_SRT = 3
const FRENCH_SRT = 4

/** One video stream at 4 fps (quarter-second frames), two audio tracks and two text subtitles. */
const ITEM: BaseItemDto = {
  ...createItem(),
  MediaSources: [
    {
      Id: 'item-1-media-source',
      MediaStreams: [
        { Type: 'Video', Index: 0, RealFrameRate: 4 },
        {
          Type: 'Audio',
          Index: ENGLISH,
          Codec: 'aac',
          Language: 'eng',
          DisplayTitle: 'English',
          IsDefault: true,
        },
        {
          Type: 'Audio',
          Index: JAPANESE,
          Codec: 'aac',
          Language: 'jpn',
          DisplayTitle: 'Japanese',
        },
        {
          Type: 'Subtitle',
          Index: SPANISH_SRT,
          Codec: 'subrip',
          Language: 'spa',
          DisplayTitle: 'Spanish',
        },
        {
          Type: 'Subtitle',
          Index: FRENCH_SRT,
          Codec: 'subrip',
          Language: 'fre',
          DisplayTitle: 'French',
        },
      ],
    },
  ],
}

/** ITEM with an ASS subtitle in place of the text ones. */
const ASS_ITEM: BaseItemDto = {
  ...ITEM,
  MediaSources: [
    {
      Id: 'item-1-media-source',
      MediaStreams: [
        ...(ITEM.MediaSources?.[0].MediaStreams ?? []).filter(
          (stream) => stream.Type !== 'Subtitle',
        ),
        {
          Type: 'Subtitle',
          Index: SPANISH_SRT,
          Codec: 'ass',
          Language: 'spa',
          DisplayTitle: 'Spanish',
        },
      ],
    },
  ],
}

/** ITEM, 100 s long, in two versions of the same streams. */
const TWO_VERSIONS: BaseItemDto = {
  ...ITEM,
  RunTimeTicks: 1_000_000_000,
  MediaSources: [
    { ...ITEM.MediaSources?.[0], Name: 'Theatrical' },
    { ...ITEM.MediaSources?.[0], Id: 'item-1-extended', Name: 'Extended' },
  ],
}

/** Another episode, with ITEM's streams. */
const NEXT_EPISODE: BaseItemDto = {
  ...ITEM,
  Id: 'item-2',
  MediaSources: [{ ...ITEM.MediaSources?.[0], Id: 'item-2-media-source' }],
}

const INTRO: MediaSegmentDto = {
  Id: 'intro',
  ItemId: 'item-1',
  Type: 'Intro',
  StartTicks: 10,
  EndTicks: 20,
}

/** What the first config resolution returns; a forced one is always HLS. */
let initialStrategy: PlaybackStrategy = 'direct'

type PlayerProps = ComponentProps<typeof Player>

/** What PlayerEditor puts around Player: the playback owner and its provider. */
function Owner({ item, ...playerProps }: Omit<PlayerProps, 'videoRef'>) {
  const { engine, videoRef } = usePlaybackSession({ item })
  return (
    <PlaybackProvider engine={engine}>
      <Player item={item} videoRef={videoRef} {...playerProps} />
    </PlaybackProvider>
  )
}

interface RenderOptions {
  item?: BaseItemDto
  segments?: Array<MediaSegmentDto>
}

async function renderPlayer({ item = ITEM, segments }: RenderOptions = {}) {
  const props = {
    item,
    segments,
    onCreateSegment: vi.fn<PlayerProps['onCreateSegment']>(),
    onUpdateSegmentTimestamp: vi.fn<PlayerProps['onUpdateSegmentTimestamp']>(),
  }
  const utils = render(<Owner {...props} />)
  const video = await mountedVideo(utils.container)
  return { ...utils, props, video }
}

/** PlayerEditor on TWO_VERSIONS until "Next episode" switches it, as the header's picker does. */
function EditorRoute() {
  const [item, setItem] = useState(TWO_VERSIONS)
  return (
    <>
      <button type="button" onClick={() => setItem(NEXT_EPISODE)}>
        Next episode
      </button>
      <PlayerEditor item={item} fetchSegments={false} />
    </>
  )
}

/** The real PlayerEditor, with no segments yet, in a router and a query client. */
async function renderEditor({ strict = false } = {}) {
  const rootRoute = createRootRoute({ component: EditorRoute })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory(),
  })
  const utils = render(
    <QueryClientProvider client={new QueryClient()}>
      {/* SAFETY: the generated app route tree owns the registered router
          type; this harness mounts a one-route tree instead. */}
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
    { reactStrictMode: strict },
  )
  await screen.findByRole('button', { name: 'Minimize player' })
  const video = await mountedVideo(utils.container)
  return { ...utils, video }
}

/**
 * The <video> on screen, with the text tracks and duration jsdom does not
 * provide, once its source is applied.
 */
async function mountedVideo(container: HTMLElement) {
  const video = asElement(container.querySelector('video'), HTMLVideoElement)
  // The subtitles' text tracks, which jsdom does not build from <track>.
  Object.defineProperty(video, 'textTracks', {
    configurable: true,
    value: [{ mode: 'disabled' }, { mode: 'disabled' }],
  })
  Object.defineProperty(video, 'duration', { configurable: true, value: 100 })
  await act(settle)
  act(() => {
    video.dispatchEvent(new Event('durationchange'))
  })
  return video
}

/** Hides the player, as its minimize button does. */
function hidePlayer() {
  fireEvent.click(button('Minimize player'))
}

/** Shows the player again, as the editor's button does; resolves to its new <video>. */
function showPlayer(container: HTMLElement) {
  fireEvent.click(button('Show player'))
  return mountedVideo(container)
}

function canPlay(video: HTMLVideoElement) {
  act(() => {
    video.dispatchEvent(new Event('canplay'))
  })
}

/** Plays from `seconds`, as far as the playhead can tell. */
function playAt(video: HTMLVideoElement, seconds: number) {
  video.currentTime = seconds
  act(() => {
    video.dispatchEvent(new Event('timeupdate'))
  })
}

function press(key: string, init: KeyboardEventInit = {}) {
  act(() => {
    fireEvent.keyDown(document.body, { key, ...init })
  })
}

function openMenu(name: string) {
  fireEvent.click(screen.getByRole('button', { name }))
}

function button(name: string) {
  return screen.getByRole('button', { name })
}

function menuItem(name: string) {
  return screen.getByRole('menuitem', { name })
}

beforeEach(() => {
  FakeHls.instances.length = 0
  initialStrategy = 'direct'
  vi.mocked(getPlaybackConfig).mockImplementation(
    async (item, _startTicks, audioStreamIndex, forceHls = false) =>
      forceHls || initialStrategy === 'hls'
        ? {
            strategy: 'hls',
            url: `https://jellyfin.example/Videos/${item.Id}/master.m3u8?AudioStreamIndex=${audioStreamIndex}`,
          }
        : {
            strategy: 'direct',
            url: `https://jellyfin.example/Videos/${item.Id}/stream`,
          },
  )
  // jsdom plays nothing; these follow the media element algorithms.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    setPaused(this, false)
    this.dispatchEvent(new Event('play'))
    return Promise.resolve()
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    setPaused(this, true)
    this.dispatchEvent(new Event('pause'))
  })
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    this.currentTime = 0
    setPaused(this, true)
    this.playbackRate = this.defaultPlaybackRate
    this.dispatchEvent(new Event('emptied'))
  })
  // Subtitle URLs are built from the signed-in server.
  useApiStore.setState({
    serverAddress: 'https://jellyfin.example',
    apiKey: 'api-key',
  })
  useSessionStore.setState({ playerVolume: 1, playerMuted: false })
  useAppStore.setState({
    showVideoPlayer: true,
    segmentSkipMode: 'button',
    jellyfinPlaybackSyncEnabled: false,
  })
  const preferences = useAppStore.getState()
  preferences.setPreferredAudioLanguage(null)
  preferences.setPreferredSubtitleLanguage(null)
  preferences.setSubtitlesEnabled(false)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('Player transport', () => {
  it('plays and pauses from the play button', async () => {
    const { video } = await renderPlayer()
    const play = button('Play or pause video')
    expect(play.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(play)
    expect(video.paused).toBe(false)
    expect(play.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(play)
    expect(video.paused).toBe(true)
    expect(play.getAttribute('aria-pressed')).toBe('false')
  })

  it('applies the persisted volume and mute to the element on mount', async () => {
    useSessionStore.setState({ playerVolume: 0.3, playerMuted: true })
    const { video } = await renderPlayer()

    expect(video.volume).toBe(0.3)
    expect(video.muted).toBe(true)
    expect(button('Volume muted')).toBeTruthy()
  })

  it('mutes at volume 0, unmutes when raised, and persists both', async () => {
    const { video } = await renderPlayer()
    openMenu('Volume')
    const slider = screen.getByRole('slider', { name: 'player.volumeSlider' })

    fireEvent.change(slider, { target: { value: '0' } })
    expect(video).toMatchObject({ volume: 0, muted: true })
    expect(useSessionStore.getState()).toMatchObject({
      playerVolume: 0,
      playerMuted: true,
    })
    expect(screen.getByRole('button', { name: 'Volume muted' })).toBeTruthy()

    fireEvent.change(slider, { target: { value: '0.5' } })
    expect(video).toMatchObject({ volume: 0.5, muted: false })
    expect(useSessionStore.getState()).toMatchObject({
      playerVolume: 0.5,
      playerMuted: false,
    })
    expect(slider.getAttribute('aria-valuenow')).toBe('0.5')

    fireEvent.click(button('player.mute'))
    expect(video.muted).toBe(true)
    expect(useSessionStore.getState().playerMuted).toBe(true)
    expect(slider.getAttribute('aria-valuenow')).toBe('0')
  })

  it('follows a volume change made outside the player, such as native fullscreen', async () => {
    const { video } = await renderPlayer()

    video.muted = true
    await act(settle)

    expect(button('Volume muted')).toBeTruthy()
    expect(useSessionStore.getState().playerMuted).toBe(true)
  })

  it('keeps the chosen speed in the menu and across the HLS fallback', async () => {
    const { video } = await renderPlayer()
    openMenu('Player settings')
    fireEvent.click(screen.getByRole('radio', { name: '1.5x speed' }))
    expect(video.playbackRate).toBe(1.5)

    act(() => {
      failMedia(video)
    })
    await act(settle)

    expect(latestHls().media).toBe(video)
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled()
    expect(video.playbackRate).toBe(1.5)
    expect(
      screen
        .getByRole('radio', { name: '1.5x speed' })
        .getAttribute('aria-checked'),
    ).toBe('true')
  })

  it('tells the user when direct play gives way to transcoding', async () => {
    const { video } = await renderPlayer()
    act(() => {
      failMedia(video)
    })
    await act(settle)

    expect(showNotification).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: 'player.notification.switchedToTranscode',
      }),
    )
  })

  it('minimizes the player', async () => {
    await renderPlayer()
    fireEvent.click(button('Minimize player'))
    expect(useAppStore.getState().showVideoPlayer).toBe(false)
  })
})

describe('PlayerEditor playback', () => {
  it('plays another version on the same <video>, where it was and still playing', async () => {
    const { container, video } = await renderEditor()
    playAt(video, 42)
    fireEvent.click(button('Play or pause video'))

    openMenu('Video version')
    fireEvent.click(menuItem('Extended'))
    await act(settle)

    expect(
      vi.mocked(getPlaybackConfig).mock.lastCall?.[0].MediaSources,
    ).toEqual([expect.objectContaining({ Id: 'item-1-extended' })])
    expect(container.querySelector('video')).toBe(video)
    // The released source started the element over.
    expect(video.currentTime).toBe(0)
    canPlay(video)
    expect(video.currentTime).toBe(42)
    expect(video.paused).toBe(false)
    expect(button('Play or pause video').getAttribute('aria-pressed')).toBe(
      'true',
    )
  })

  it('resumes where it was when the hidden player is shown again', async () => {
    useAppStore.setState({ jellyfinPlaybackSyncEnabled: true })
    const { container, video } = await renderEditor()
    playAt(video, 42)
    fireEvent.click(button('Play or pause video'))

    hidePlayer()
    expect(container.querySelector('video')).toBe(null)
    expect(stopPlaybackStatus).toHaveBeenCalledTimes(1)

    const shown = await showPlayer(container)
    expect(shown).not.toBe(video)
    expect(button('Play or pause video').getAttribute('aria-pressed')).toBe(
      'false',
    )
    canPlay(shown)
    expect(shown.currentTime).toBe(42)
    expect(shown.paused).toBe(false)
    expect(button('Play or pause video').getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(startPlaybackStatus).toHaveBeenCalledTimes(2)
    expect(startPlaybackStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ positionTicks: 420_000_000 }),
    )
  })

  it('gives segments the player position and seeks them only while the player is shown', async () => {
    const { container, video } = await renderEditor()
    playAt(video, 12.3)
    // The editor's own, below the player's.
    const newSegment = screen
      .getAllByRole('button', { name: 'editor.newSegment' })
      .at(-1)
    fireEvent.click(asElement(newSegment, HTMLElement))
    fireEvent.click(menuItem('Intro'))
    expect(button('Set start from player')).toBeTruthy()

    hidePlayer()
    expect(
      screen.queryByRole('button', { name: 'Set start from player' }),
    ).toBe(null)
    fireEvent.click(button('accessibility.seekToEnd'))

    const shown = await showPlayer(container)
    canPlay(shown)
    expect(shown.currentTime).toBe(12.3)
    expect(shown.paused).toBe(true)
    fireEvent.click(button('accessibility.seekToEnd'))
    expect(shown.currentTime).toBe(13.25)
  })

  it('starts another episode at 0, paused, with the default speed, skip size and subtitle offset', async () => {
    const { container, video } = await renderEditor()
    fireEvent.click(button('Audio and subtitle tracks'))
    fireEvent.click(menuItem('French'))
    await act(settle)
    playAt(video, 42)
    fireEvent.click(button('Play or pause video'))
    openMenu('Player settings')
    fireEvent.click(screen.getByRole('radio', { name: '1.5x speed' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Skip 10 seconds' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Subtitle Offset' }), {
      target: { value: '2.5' },
    })

    fireEvent.click(button('Next episode'))
    await act(settle)

    expect(
      vi
        .mocked(getPlaybackConfig)
        .mock.calls.filter(([item]) => item.Id === 'item-2'),
    ).toHaveLength(1)
    expect(container.querySelector('video')).toBe(video)
    canPlay(video)
    expect(video.currentTime).toBe(0)
    expect(video.paused).toBe(true)
    expect(button('Play or pause video').getAttribute('aria-pressed')).toBe(
      'false',
    )
    expect(video.playbackRate).toBe(1)
    expect(
      screen
        .getByRole('radio', { name: '1x speed' })
        .getAttribute('aria-checked'),
    ).toBe('true')
    expect(
      screen
        .getByRole('radio', { name: 'Skip 5 seconds' })
        .getAttribute('aria-checked'),
    ).toBe('true')
    expect(
      asElement(
        screen.getByRole('slider', { name: 'Subtitle Offset' }),
        HTMLInputElement,
      ).value,
    ).toBe('0')
  })

  it('starts one playback under StrictMode, and keeps it across renders', async () => {
    initialStrategy = 'hls'
    useAppStore.setState({ jellyfinPlaybackSyncEnabled: true })
    await renderEditor({ strict: true })
    fireEvent.click(button('Play or pause video'))
    fireEvent.click(button('Play or pause video'))
    await act(settle)

    expect(FakeHls.instances).toHaveLength(1)
    expect(startPlaybackStatus).toHaveBeenCalledTimes(1)
    expect(stopPlaybackStatus).not.toHaveBeenCalled()
  })
})

describe('Player tracks and segments', () => {
  it('switches audio from the track menu, locking the menu until the switch lands', async () => {
    initialStrategy = 'hls'
    await renderPlayer()
    // The transcode restart waits for the previous encoding to stop.
    const encoding = deferred()
    vi.mocked(stopActiveEncoding).mockReturnValueOnce(encoding.promise)
    const trigger = button('Audio and subtitle tracks')

    fireEvent.click(trigger)
    expect(menuItem('English').getAttribute('aria-current')).toBe('true')
    fireEvent.click(menuItem('Japanese'))
    expect(trigger.hasAttribute('disabled')).toBe(true)

    await act(async () => {
      encoding.resolve()
      await settle()
    })

    expect(trigger.hasAttribute('disabled')).toBe(false)
    expect(latestHls().loadedUrls.at(-1)).toContain(
      `AudioStreamIndex=${JAPANESE}`,
    )
    expect(useAppStore.getState().trackPreferences.preferredAudioLanguage).toBe(
      'jpn',
    )
    fireEvent.click(trigger)
    expect(menuItem('Japanese').getAttribute('aria-current')).toBe('true')
  })

  it('renders a caption <track> per text subtitle under HLS too', async () => {
    initialStrategy = 'hls'
    const { container } = await renderPlayer()

    const tracks = Array.from(container.querySelectorAll('track'))
    expect(tracks.map((track) => track.srclang)).toEqual(['spa', 'fre'])
  })

  it('picks a subtitle from the track menu, and offers its offset until Off', async () => {
    const { video } = await renderPlayer()
    const trigger = button('Audio and subtitle tracks')

    fireEvent.click(trigger)
    expect(menuItem('Off').getAttribute('aria-current')).toBe('true')
    openMenu('Player settings')
    expect(screen.queryByText('Subtitle Offset')).toBe(null)

    fireEvent.click(menuItem('French'))
    await act(settle)
    expect(Array.from(video.textTracks, (track) => track.mode)).toEqual([
      'disabled',
      'showing',
    ])
    expect(useAppStore.getState().trackPreferences).toMatchObject({
      subtitlesEnabled: true,
      preferredSubtitleLanguage: 'fre',
    })
    expect(screen.getByText('Subtitle Offset')).toBeTruthy()

    fireEvent.click(trigger)
    expect(menuItem('French').getAttribute('aria-current')).toBe('true')
    fireEvent.click(menuItem('Off'))
    await act(settle)
    expect(video.textTracks[1].mode).toBe('disabled')
    expect(useAppStore.getState().trackPreferences.subtitlesEnabled).toBe(false)
    expect(screen.queryByText('Subtitle Offset')).toBe(null)
  })

  it('moves ASS subtitles with the offset slider', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    const { video } = await renderPlayer({ item: ASS_ITEM })
    // The renderer starts once the video has metadata and a size.
    Object.defineProperties(video, {
      readyState: { configurable: true, value: 1 },
      videoWidth: { configurable: true, value: 1280 },
    })

    openMenu('Audio and subtitle tracks')
    fireEvent.click(menuItem('Spanish'))
    await act(settle)
    openMenu('Player settings')
    fireEvent.change(screen.getByRole('slider', { name: 'Subtitle Offset' }), {
      target: { value: '1.5' },
    })

    expect(setTimeOffset).toHaveBeenLastCalledWith(0, 1.5)
  })

  it('offers to skip the segment playing and seeks past it', async () => {
    const { video } = await renderPlayer({ segments: [INTRO] })
    playAt(video, 12)

    fireEvent.click(button('Skip Intro'))

    expect(video.currentTime).toBe(20)
    expect(screen.queryByRole('button', { name: 'Skip Intro' })).toBe(null)
  })

  it('creates a segment at the frame-snapped live position', async () => {
    const { video, props } = await renderPlayer()
    video.currentTime = 12.3

    openMenu('editor.newSegment')
    fireEvent.click(menuItem('Intro'))

    expect(props.onCreateSegment).toHaveBeenCalledWith({
      type: 'Intro',
      start: 12.25,
    })
  })
})

describe('Player keyboard shortcuts', () => {
  it('plays and pauses on Space', async () => {
    const { video } = await renderPlayer()
    press(' ', { code: 'Space' })
    expect(video.paused).toBe(false)
    press(' ', { code: 'Space' })
    expect(video.paused).toBe(true)
  })

  it('skips by the skip size on A and D, which W and S change', async () => {
    const { video } = await renderPlayer()
    playAt(video, 10)

    press('d')
    expect(video.currentTime).toBe(15)
    press('w')
    press('d')
    expect(video.currentTime).toBe(25)
    press('s')
    press('s')
    press('a')
    expect(video.currentTime).toBe(24)
  })

  it('steps one frame on , and .', async () => {
    const { video } = await renderPlayer()
    playAt(video, 10)

    press('.')
    expect(video.currentTime).toBe(10.25)
    press(',')
    press(',')
    expect(video.currentTime).toBe(9.75)
  })

  it('stamps the active segment with the frame-snapped position on E and F', async () => {
    const { video, props } = await renderPlayer()
    video.currentTime = 12.3

    press('e')
    press('f')

    expect(props.onUpdateSegmentTimestamp.mock.calls).toEqual([
      [{ currentTime: 12.25, start: true }],
      [{ currentTime: 12.25, start: false }],
    ])
  })

  it('toggles mute on M and persists it', async () => {
    const { video } = await renderPlayer()
    press('m')
    expect(video.muted).toBe(true)
    expect(useSessionStore.getState().playerMuted).toBe(true)
    press('m')
    expect(video.muted).toBe(false)
    expect(useSessionStore.getState().playerMuted).toBe(false)
  })

  it('toggles the first subtitle on C and persists it', async () => {
    const { video } = await renderPlayer()

    press('c')
    await act(settle)
    expect(video.textTracks[0].mode).toBe('showing')
    expect(useAppStore.getState().trackPreferences).toMatchObject({
      subtitlesEnabled: true,
      preferredSubtitleLanguage: 'spa',
    })

    press('c')
    await act(settle)
    expect(video.textTracks[0].mode).toBe('disabled')
    expect(useAppStore.getState().trackPreferences.subtitlesEnabled).toBe(false)
  })

  it('requests fullscreen for the player on F11 and from its button', async () => {
    const { container } = await renderPlayer()
    const section = asElement(container.querySelector('section'), HTMLElement)
    const requestFullscreen = vi.fn(async () => {})
    section.requestFullscreen = requestFullscreen

    press('F11')
    fireEvent.click(button('Fullscreen'))

    expect(requestFullscreen).toHaveBeenCalledTimes(2)
  })

  it('changes speed on Alt+. and Alt+, and stops at either end', async () => {
    const { video } = await renderPlayer()
    const faster = () => press('.', { altKey: true, code: 'Period' })
    const slower = () => press(',', { altKey: true, code: 'Comma' })
    const checkedSpeeds = () =>
      screen
        .getAllByRole('radio', { name: /x speed$/ })
        .filter((radio) => radio.getAttribute('aria-checked') === 'true')
        .map((radio) => radio.getAttribute('aria-label'))

    faster()
    expect(video.playbackRate).toBe(1.25)
    slower()
    slower()
    expect(video.playbackRate).toBe(0.75)

    openMenu('Player settings')
    for (let i = 0; i < 6; i++) faster()
    expect(video.playbackRate).toBe(2)
    expect(checkedSpeeds()).toEqual(['2x speed'])
    slower()
    expect(video.playbackRate).toBe(1.75)

    for (let i = 0; i < 8; i++) slower()
    expect(video.playbackRate).toBe(0.25)
    expect(checkedSpeeds()).toEqual(['0.25x speed'])
    faster()
    expect(video.playbackRate).toBe(0.5)
  })
})
