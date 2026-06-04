/**
 * @vitest-environment jsdom
 */

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'

import { Player } from '@/components/player/Player'
import type { PlayerSurface } from '@/components/player/PlayerSurface'
import type { BaseItemDto } from '@/types/jellyfin'
import type { VideoPlayerError } from '@/hooks/use-video-player'

type PlayerSurfaceProps = ComponentProps<typeof PlayerSurface>

const mocks = vi.hoisted(() => ({
  playerSurfaceProps: [] as Array<unknown>,
  videoPlayerOptions: null as null | {
    onError?: (error: unknown) => void
  },
  setShowVideoPlayer: vi.fn(),
  setPreferredAudioLanguage: vi.fn(),
  setPreferredSubtitleLanguage: vi.fn(),
  setSubtitlesEnabled: vi.fn(),
  setPlayerVolume: vi.fn(),
  setPlayerMuted: vi.fn(),
  selectAudioTrack: vi.fn(() => Promise.resolve(undefined)),
  selectSubtitleTrack: vi.fn(() => Promise.resolve(undefined)),
  getButtonStyle: vi.fn(() => ({ color: '#ffffff' })),
  resizeJassub: vi.fn(),
  setJassubUserOffset: vi.fn(),
  retry: vi.fn(),
  fullscreenUi: {
    isFullscreen: true,
    showFullscreenControls: false,
    videoFitMode: 'cover' as const,
    toggleVideoFitMode: vi.fn(),
    handleVideoInteraction: vi.fn(),
    handleFullscreenMouseMove: vi.fn(),
    handleContainerMouseLeave: vi.fn(),
  },
}))

const trackState = {
  audioTracks: [
    {
      index: 1,
      relativeIndex: 0,
      language: 'eng',
      displayTitle: 'English - AAC Stereo',
      codec: 'AAC',
      channels: 2,
      isDefault: true,
    },
  ],
  subtitleTracks: [
    {
      index: 2,
      relativeIndex: 0,
      language: 'spa',
      displayTitle: 'Spanish - SRT',
      format: 'SRT',
      isExternal: true,
      isDefault: false,
    },
  ],
  activeAudioIndex: 1,
  activeSubtitleIndex: 2,
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}))

vi.mock('@/components/player/PlayerSurface', () => ({
  PlayerSurface: (props: unknown) => {
    mocks.playerSurfaceProps.push(props)
    return null
  },
}))

vi.mock('@/components/player/PlayerScrubber', () => ({
  PlayerScrubber: () => null,
}))

vi.mock('@/hooks/useBlobUrl', () => ({
  useBlobUrl: () => '',
}))

vi.mock('@/hooks/use-vibrant-button-style', () => ({
  useVibrantButtonStyle: () => ({
    getButtonStyle: mocks.getButtonStyle,
    iconColor: '#ffffff',
    hasColors: true,
  }),
}))

vi.mock('@/hooks/use-video-player', () => ({
  useVideoPlayer: (options: unknown) => {
    mocks.videoPlayerOptions = options as typeof mocks.videoPlayerOptions
    return {
      videoRef: { current: null },
      hlsRef: { current: null },
      strategy: 'direct',
      isLoading: true,
      retry: mocks.retry,
      reloadHlsWithUrl: vi.fn(),
    }
  },
}))

vi.mock('@/components/player/use-fullscreen-player-ui', () => ({
  useFullscreenPlayerUi: () => mocks.fullscreenUi,
}))

vi.mock('@/hooks/use-track-manager', () => ({
  useTrackManager: () => ({
    trackState,
    selectAudioTrack: mocks.selectAudioTrack,
    selectSubtitleTrack: mocks.selectSubtitleTrack,
    isLoading: true,
  }),
}))

vi.mock('@/hooks/use-jassub-renderer', () => ({
  useJassubRenderer: () => ({
    setUserOffset: mocks.setJassubUserOffset,
    resize: mocks.resizeJassub,
  }),
}))

vi.mock('@/hooks/use-player-keyboard', () => ({
  usePlayerKeyboard: () => undefined,
}))

vi.mock('@/services/video/track-switching', async (importOriginal) => {
  const actual = await importOriginal<object>()
  return {
    ...actual,
    getSubtitleDeliveryUrl: (
      itemId: string,
      trackIndex: number,
      format: string,
    ) => `/subtitle/${itemId}/${trackIndex}.${format}`,
  }
})

vi.mock('@/services/video/api', async (importOriginal) => {
  const actual = await importOriginal<object>()
  return {
    ...actual,
    getBestImageUrl: () => null,
  }
})

vi.mock('@/stores/app-store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      segmentSkipMode: 'button',
      segmentSkipModeRevision: 0,
      jellyfinPlaybackSyncEnabled: false,
      trackPreferences: {
        preferredAudioLanguage: 'eng',
      },
      setShowVideoPlayer: mocks.setShowVideoPlayer,
      setPreferredAudioLanguage: mocks.setPreferredAudioLanguage,
      setPreferredSubtitleLanguage: mocks.setPreferredSubtitleLanguage,
      setSubtitlesEnabled: mocks.setSubtitlesEnabled,
    }),
}))

vi.mock('@/stores/session-store', () => ({
  useSessionStore: (selector: (state: unknown) => unknown) =>
    selector({
      playerVolume: 0.8,
      playerMuted: false,
      setPlayerVolume: mocks.setPlayerVolume,
      setPlayerMuted: mocks.setPlayerMuted,
    }),
}))

function createItem(): BaseItemDto {
  return {
    Id: 'item-1',
    Name: 'Movie',
    Type: 'Movie',
    MediaSources: [
      {
        MediaStreams: [
          {
            Type: 'Audio',
            Index: 1,
            Language: 'eng',
          },
        ],
      },
    ],
  } as BaseItemDto
}

describe('Player controls wiring', () => {
  beforeEach(() => {
    mocks.playerSurfaceProps = []
    mocks.videoPlayerOptions = null
    mocks.setShowVideoPlayer.mockClear()
    mocks.setPreferredAudioLanguage.mockClear()
    mocks.setPreferredSubtitleLanguage.mockClear()
    mocks.setSubtitlesEnabled.mockClear()
    mocks.selectAudioTrack.mockClear()
    mocks.selectSubtitleTrack.mockClear()
    mocks.retry.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it('passes Player state, handlers, and render groups through to PlayerSurface', async () => {
    render(
      <Player
        item={createItem()}
        vibrantColors={null}
        frameStepSeconds={1 / 24}
        onCreateSegment={vi.fn()}
        onUpdateSegmentTimestamp={vi.fn()}
      />,
    )

    let surfaceProps = mocks.playerSurfaceProps.at(-1) as PlayerSurfaceProps
    expect(surfaceProps.fullscreen).toMatchObject({
      isFullscreen: true,
      showControls: false,
      videoFitMode: 'cover',
    })
    expect(surfaceProps.video.primaryCaptionTrack).toMatchObject({
      index: 2,
      language: 'spa',
      label: 'Spanish - SRT',
    })
    expect(surfaceProps.playback).toMatchObject({
      isVideoLoading: true,
      isRecovering: false,
      strategy: 'direct',
    })
    expect(surfaceProps.playback.error).toBe(null)
    expect(surfaceProps.segmentSkip.mode).toBe('button')
    expect(surfaceProps.segmentSkip.activeSegment).toBe(null)
    expect(surfaceProps.controls.fullscreenTimelineScrubber).toBeTruthy()
    expect(surfaceProps.controls.inlineTimelineScrubber).toBeTruthy()

    const controlsProps = surfaceProps.controls.props
    expect(controlsProps.playback.state).toBe('paused')
    expect(controlsProps.volumeControls.state).toBe('audible')
    expect(controlsProps.volumeControls.level).toBe(0.8)
    expect(controlsProps.appearance.colorMode).toBe('vibrant')
    expect(controlsProps.display.mode).toBe('fullscreen')
    expect(controlsProps.trackControls?.state).toBe(trackState)
    expect(controlsProps.trackControls?.availability).toBe('disabled')
    expect(controlsProps.settings.subtitleState).toBe('active')

    await act(async () => {
      await controlsProps.trackControls?.onSelectAudio(1)
    })
    expect(mocks.selectAudioTrack).toHaveBeenCalledWith(1)
    expect(mocks.setPreferredAudioLanguage).toHaveBeenCalledWith('eng')

    await act(async () => {
      await controlsProps.trackControls?.onSelectSubtitle(null)
    })
    expect(mocks.selectSubtitleTrack).toHaveBeenCalledWith(null)
    expect(mocks.setSubtitlesEnabled).toHaveBeenCalledWith(false)

    act(() => {
      controlsProps.display.onMinimize?.()
    })
    expect(mocks.setShowVideoPlayer).toHaveBeenCalledWith(false)

    const mediaError: VideoPlayerError = {
      type: 'media_error',
      message: 'Playback failed',
      recoverable: true,
    }
    act(() => {
      mocks.videoPlayerOptions?.onError?.(mediaError)
    })

    surfaceProps = mocks.playerSurfaceProps.at(-1) as PlayerSurfaceProps
    expect(surfaceProps.playback.error).toEqual({
      type: 'media',
      message: 'Playback failed',
      recoverable: true,
    })
    surfaceProps.playback.onRetry()
    expect(mocks.retry).toHaveBeenCalledTimes(1)
  })
})
