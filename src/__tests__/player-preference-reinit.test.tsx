/**
 * @vitest-environment jsdom
 *
 * Regression coverage for the Player → preference store → useVideoPlayer
 * path: persisting the language of a successfully switched audio track must
 * not re-key useVideoPlayer's initialization effect and reload the source.
 */

import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'

import { Player } from '@/components/player/Player'
import type { PlayerSurface } from '@/components/player/PlayerSurface'
import type { BaseItemDto } from '@/types/jellyfin'
import type * as VideoApiModule from '@/services/video/api'
import { getPlaybackConfig } from '@/services/video/api'
import { useAppStore } from '@/stores/app-store'

type PlayerSurfaceProps = ComponentProps<typeof PlayerSurface>

const mocks = vi.hoisted(() => ({
  playerSurfaceProps: [] as Array<unknown>,
  hlsVideoRef: { current: null as HTMLVideoElement | null },
  fullscreenUi: {
    isFullscreen: false,
    showFullscreenControls: true,
    videoFitMode: 'contain' as const,
    toggleVideoFitMode: vi.fn(),
    handleVideoInteraction: vi.fn(),
    handleFullscreenMouseMove: vi.fn(),
    handleContainerMouseLeave: vi.fn(),
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}))

vi.mock('@/components/player/PlayerSurface', () => ({
  PlayerSurface: (props: unknown) => {
    // Attach a video element the way the real surface would, so the direct
    // play wiring and manual track selection see a live element.
    const videoRef = (
      props as { videoRef: { current: HTMLVideoElement | null } }
    ).videoRef
    if (!videoRef.current) {
      videoRef.current = document.createElement('video')
    }
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

vi.mock('@/components/player/use-fullscreen-player-ui', () => ({
  useFullscreenPlayerUi: () => mocks.fullscreenUi,
}))

vi.mock('@/hooks/use-jassub-renderer', () => ({
  useJassubRenderer: () => ({
    setUserOffset: vi.fn(),
    resize: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-player-keyboard', () => ({
  usePlayerKeyboard: () => undefined,
}))

vi.mock('@/hooks/use-hls-player', () => ({
  useHlsPlayer: () => ({
    videoRef: mocks.hlsVideoRef,
    hlsRef: { current: null },
    retry: vi.fn(),
  }),
}))

vi.mock('@/services/video/api', async (importOriginal) => ({
  // Keep the real getPlaybackMediaSourceId so the test cannot drift from the
  // production fallback logic.
  ...(await importOriginal<typeof VideoApiModule>()),
  getPlaybackConfig: vi.fn(),
  getBestImageUrl: () => null,
  getImageBlurhash: () => undefined,
}))

vi.mock('@/services/video/track-switching', () => ({
  applyInitialAudioTrack: vi.fn(() => Promise.resolve({ success: true })),
  switchAudioTrack: vi.fn(() => Promise.resolve({ success: true })),
  switchSubtitleTrack: vi.fn(() => Promise.resolve({ success: true })),
  getSubtitleDeliveryUrl: () => '',
}))

vi.mock('@/services/video/playback-session', () => ({
  reportPlaybackProgress: vi.fn(() => Promise.resolve()),
  startPlaybackStatus: vi.fn(() => Promise.resolve()),
  stopPlaybackStatus: vi.fn(() => Promise.resolve()),
  stopPlaybackStatusKeepalive: vi.fn(),
}))

vi.mock('@/services/video/transcode-session', () => ({
  stopActiveEncoding: vi.fn(() => Promise.resolve()),
  stopActiveEncodingKeepalive: vi.fn(),
}))

vi.mock('@/services/video/session', () => ({
  createPlaySessionId: vi.fn(() => 'session-1'),
}))

vi.mock('@/lib/notifications', () => ({
  showError: vi.fn(),
  showNotification: vi.fn(),
}))

const ENGLISH_INDEX = 1
const JAPANESE_INDEX = 2

function createItem(): BaseItemDto {
  return {
    Id: 'item-1',
    Name: 'Movie',
    Type: 'Movie',
    MediaSources: [
      {
        Id: 'source-1',
        Container: 'mkv',
        MediaStreams: [
          { Type: 'Video', Index: 0, Codec: 'h264' },
          {
            Type: 'Audio',
            Index: ENGLISH_INDEX,
            Codec: 'aac',
            Language: 'eng',
            Channels: 2,
            IsDefault: true,
          },
          {
            Type: 'Audio',
            Index: JAPANESE_INDEX,
            Codec: 'aac',
            Language: 'jpn',
            Channels: 2,
          },
        ],
      },
    ],
  }
}

function latestSurfaceProps(): PlayerSurfaceProps {
  return mocks.playerSurfaceProps.at(-1) as PlayerSurfaceProps
}

describe('Player audio preference persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.playerSurfaceProps = []
    mocks.hlsVideoRef.current = document.createElement('video')
    vi.mocked(getPlaybackConfig).mockResolvedValue({
      strategy: 'direct',
      url: 'https://jellyfin.example/Videos/item-1/stream',
    })
    useAppStore.getState().setPreferredAudioLanguage(null)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    useAppStore.getState().setPreferredAudioLanguage(null)
  })

  it('does not reinitialize playback when a successful switch persists its language', async () => {
    render(
      <Player
        item={createItem()}
        frameStepSeconds={1 / 24}
        onCreateSegment={vi.fn()}
        onUpdateSegmentTimestamp={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(getPlaybackConfig).toHaveBeenCalledTimes(1)
    })

    // One initial direct load, then one successful native preference change.
    await act(async () => {
      await latestSurfaceProps().controlsProps.trackControls?.onSelectAudio(
        JAPANESE_INDEX,
      )
    })

    // The switch was applied in place and its language persisted...
    expect(useAppStore.getState().trackPreferences.preferredAudioLanguage).toBe(
      'jpn',
    )
    await waitFor(() => {
      expect(
        latestSurfaceProps().controlsProps.trackControls?.state
          .activeAudioIndex,
      ).toBe(JAPANESE_INDEX)
    })

    // ...without re-keying useVideoPlayer's init effect: a second
    // getPlaybackConfig call would tear down and reload the source the
    // native switch just kept alive.
    await act(async () => {
      await Promise.resolve()
    })
    expect(getPlaybackConfig).toHaveBeenCalledTimes(1)
  })

  it('applies a changed preference to the next item', async () => {
    const { rerender } = render(
      <Player
        item={createItem()}
        frameStepSeconds={1 / 24}
        onCreateSegment={vi.fn()}
        onUpdateSegmentTimestamp={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(getPlaybackConfig).toHaveBeenCalledTimes(1)
    })
    expect(getPlaybackConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({ Id: 'item-1' }),
      undefined,
      ENGLISH_INDEX,
      false,
      'session-1',
    )

    await act(async () => {
      await latestSurfaceProps().controlsProps.trackControls?.onSelectAudio(
        JAPANESE_INDEX,
      )
    })

    // Freezing the in-session index must not freeze the preference itself:
    // the next item still initializes from the persisted language.
    const nextItem = { ...createItem(), Id: 'item-2' }
    nextItem.MediaSources = [
      { ...createItem().MediaSources![0], Id: 'source-2' },
    ]
    rerender(
      <Player
        item={nextItem}
        frameStepSeconds={1 / 24}
        onCreateSegment={vi.fn()}
        onUpdateSegmentTimestamp={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(getPlaybackConfig).toHaveBeenCalledTimes(2)
    })
    expect(getPlaybackConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({ Id: 'item-2' }),
      undefined,
      JAPANESE_INDEX,
      false,
      'session-1',
    )
  })

  it('preserves the natively switched audio track when direct play falls back to HLS on error', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(
      () => undefined,
    )

    render(
      <Player
        item={createItem()}
        frameStepSeconds={1 / 24}
        onCreateSegment={vi.fn()}
        onUpdateSegmentTimestamp={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(getPlaybackConfig).toHaveBeenCalledTimes(1)
    })
    expect(getPlaybackConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({ Id: 'item-1' }),
      undefined,
      ENGLISH_INDEX,
      false,
      'session-1',
    )

    // One successful native in-place switch moves the session off the
    // container default without reinitializing playback.
    await act(async () => {
      await latestSurfaceProps().controlsProps.trackControls?.onSelectAudio(
        JAPANESE_INDEX,
      )
    })
    await waitFor(() => {
      expect(
        latestSurfaceProps().controlsProps.trackControls?.state
          .activeAudioIndex,
      ).toBe(JAPANESE_INDEX)
    })

    const video = latestSurfaceProps().videoRef.current!
    Object.defineProperty(video, 'error', {
      configurable: true,
      value: { code: MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED },
    })
    act(() => {
      video.dispatchEvent(new Event('error'))
    })

    // The forced-HLS fallback restarts on the exact track the user is
    // hearing, not the container default the frozen initial index points at.
    await waitFor(() => {
      expect(getPlaybackConfig).toHaveBeenCalledWith(
        expect.objectContaining({ Id: 'item-1' }),
        undefined,
        JAPANESE_INDEX,
        true,
        'session-1',
      )
    })
  })
})
