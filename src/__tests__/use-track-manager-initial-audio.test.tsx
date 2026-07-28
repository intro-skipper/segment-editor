// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BaseItemDto } from '@/types/jellyfin'
import type { PlaybackStrategy } from '@/services/video/api'
import { useTrackManager } from '@/hooks/use-track-manager'
import { useAppStore } from '@/stores/app-store'

const applyInitialAudioTrackMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ success: true })),
)
const switchAudioTrackMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ success: true })),
)
const switchSubtitleTrackMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ success: true })),
)
const showErrorMock = vi.hoisted(() => vi.fn())

vi.mock('@/services/video/track-switching', () => ({
  applyInitialAudioTrack: applyInitialAudioTrackMock,
  switchAudioTrack: switchAudioTrackMock,
  switchSubtitleTrack: switchSubtitleTrackMock,
}))

vi.mock('@/lib/notifications', () => ({
  showError: showErrorMock,
}))

const JAPANESE_STREAM_INDEX = 2

function createItem(): BaseItemDto {
  return {
    Id: 'item-1',
    Name: 'Multi audio item',
    MediaSources: [
      {
        Id: 'source-1',
        Container: 'mkv',
        MediaStreams: [
          { Type: 'Video', Index: 0, Codec: 'h264' },
          {
            Type: 'Audio',
            Index: 1,
            Codec: 'aac',
            Language: 'eng',
            Channels: 2,
            IsDefault: true,
          },
          {
            Type: 'Audio',
            Index: JAPANESE_STREAM_INDEX,
            Codec: 'aac',
            Language: 'jpn',
            Channels: 2,
          },
        ],
      },
    ],
  }
}

function renderTrackManager(
  strategy: PlaybackStrategy,
  video: HTMLVideoElement,
) {
  // Stable ref identity across re-renders, like the useRef object the real
  // Player passes; an inline literal would re-run the initial-audio effect
  // (and abort its controller) on every state update.
  const videoRef = { current: video }
  return renderHook(() =>
    useTrackManager({
      item: createItem(),
      strategy,
      videoRef,
      t: (key: string) => key,
      onReloadHls: vi.fn(),
    }),
  )
}

function createVideo(readyState: number): HTMLVideoElement {
  const video = document.createElement('video')
  Object.defineProperty(video, 'readyState', {
    configurable: true,
    value: readyState,
  })
  return video
}

describe('useTrackManager initial audio track application', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppStore.getState().setPreferredAudioLanguage('jpn')
  })

  afterEach(() => {
    cleanup()
    useAppStore.getState().setPreferredAudioLanguage(null)
  })

  it('applies the non-default audio track once direct play has metadata', async () => {
    const video = createVideo(HTMLMediaElement.HAVE_NOTHING)
    renderTrackManager('direct', video)

    expect(applyInitialAudioTrackMock).not.toHaveBeenCalled()

    act(() => {
      video.dispatchEvent(new Event('loadedmetadata'))
    })

    await waitFor(() => {
      expect(applyInitialAudioTrackMock).toHaveBeenCalledWith(
        JAPANESE_STREAM_INDEX,
        expect.objectContaining({ strategy: 'direct', videoElement: video }),
      )
    })
  })

  it('applies immediately when metadata is already available', async () => {
    const video = createVideo(HTMLMediaElement.HAVE_METADATA)
    renderTrackManager('direct', video)

    await waitFor(() => {
      expect(applyInitialAudioTrackMock).toHaveBeenCalledWith(
        JAPANESE_STREAM_INDEX,
        expect.objectContaining({ strategy: 'direct' }),
      )
    })
  })

  it('does not apply a native track in HLS mode', async () => {
    const video = createVideo(HTMLMediaElement.HAVE_METADATA)
    renderTrackManager('hls', video)

    act(() => {
      video.dispatchEvent(new Event('loadedmetadata'))
    })

    await Promise.resolve()
    expect(applyInitialAudioTrackMock).not.toHaveBeenCalled()
  })

  it('surfaces a failed initial application', async () => {
    applyInitialAudioTrackMock.mockResolvedValue({
      success: false,
      error: {
        type: 'track_unavailable',
        message: 'Audio track with index 2 not found',
        trackIndex: JAPANESE_STREAM_INDEX,
      },
    } as never)

    const video = createVideo(HTMLMediaElement.HAVE_METADATA)
    const { result } = renderTrackManager('direct', video)

    await waitFor(() => {
      expect(result.current.error).toBe('Audio track with index 2 not found')
    })
    expect(showErrorMock).toHaveBeenCalledWith(
      'player.tracks.error.switchFailed',
      'Audio track with index 2 not found',
    )
  })

  it('aborts a pending application on unmount and ignores its stale result', async () => {
    let resolveApply: ((result: unknown) => void) | undefined
    applyInitialAudioTrackMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveApply = resolve
        }) as never,
    )

    const video = createVideo(HTMLMediaElement.HAVE_METADATA)
    const { unmount } = renderTrackManager('direct', video)

    await waitFor(() => {
      expect(applyInitialAudioTrackMock).toHaveBeenCalled()
    })

    const options = (
      applyInitialAudioTrackMock.mock.calls[0] as unknown as [
        number,
        { signal: AbortSignal },
      ]
    )[1]
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(options.signal.aborted).toBe(false)

    unmount()
    expect(options.signal.aborted).toBe(true)

    await act(async () => {
      resolveApply?.({
        success: false,
        error: {
          type: 'unknown_error',
          message: 'stale failure',
          trackIndex: JAPANESE_STREAM_INDEX,
        },
      })
    })

    expect(showErrorMock).not.toHaveBeenCalled()
  })
})
