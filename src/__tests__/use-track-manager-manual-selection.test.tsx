// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BaseItemDto } from '@/types/jellyfin'
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

const DEFAULT_ENGLISH_INDEX = 1
const JAPANESE_INDEX = 2
const ENGLISH_COMMENTARY_INDEX = 3
const SPANISH_SUBTITLE_INDEX = 4

function createItem(): BaseItemDto {
  return {
    Id: 'item-1',
    Name: 'Multi track item',
    MediaSources: [
      {
        Id: 'source-1',
        Container: 'mkv',
        MediaStreams: [
          { Type: 'Video', Index: 0, Codec: 'h264' },
          {
            Type: 'Audio',
            Index: DEFAULT_ENGLISH_INDEX,
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
          {
            Type: 'Audio',
            Index: ENGLISH_COMMENTARY_INDEX,
            Codec: 'aac',
            Language: 'eng',
            Channels: 2,
          },
          {
            Type: 'Subtitle',
            Index: SPANISH_SUBTITLE_INDEX,
            Codec: 'subrip',
            Language: 'spa',
          },
        ],
      },
    ],
  }
}

function renderTrackManager(video: HTMLVideoElement) {
  const videoRef = { current: video }
  return renderHook(() =>
    useTrackManager({
      item: createItem(),
      // HLS strategy keeps the initial direct-play application inert so these
      // tests exercise only the manual selection path.
      strategy: 'hls',
      videoRef,
      t: (key: string) => key,
      onReloadHls: vi.fn(),
    }),
  )
}

function createVideo(): HTMLVideoElement {
  return document.createElement('video')
}

describe('useTrackManager manual track selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    switchAudioTrackMock.mockResolvedValue({ success: true })
    switchSubtitleTrackMock.mockResolvedValue({ success: true })
    useAppStore.getState().setPreferredAudioLanguage(null)
  })

  afterEach(() => {
    cleanup()
    useAppStore.getState().setPreferredAudioLanguage(null)
  })

  it('applies a successful audio switch, records it, and reports success', async () => {
    const { result } = renderTrackManager(createVideo())

    expect(result.current.trackState.activeAudioIndex).toBe(
      DEFAULT_ENGLISH_INDEX,
    )

    let switched = false
    await act(async () => {
      switched = await result.current.selectAudioTrack(JAPANESE_INDEX)
    })

    expect(switched).toBe(true)
    expect(switchAudioTrackMock).toHaveBeenCalledWith(
      JAPANESE_INDEX,
      expect.objectContaining({ strategy: 'hls' }),
    )
    expect(result.current.trackState.activeAudioIndex).toBe(JAPANESE_INDEX)
    expect(result.current.isLoading).toBe(false)
  })

  it('keeps the selection when the chosen language is persisted afterwards', async () => {
    const { result } = renderTrackManager(createVideo())

    await act(async () => {
      await result.current.selectAudioTrack(ENGLISH_COMMENTARY_INDEX)
    })
    expect(result.current.trackState.activeAudioIndex).toBe(
      ENGLISH_COMMENTARY_INDEX,
    )

    // Player persists the selected track's language after every successful
    // switch; with two English tracks this used to snap the selection back to
    // the first language match.
    act(() => {
      useAppStore.getState().setPreferredAudioLanguage('eng')
    })

    expect(result.current.trackState.activeAudioIndex).toBe(
      ENGLISH_COMMENTARY_INDEX,
    )
  })

  it('reports a failed switch with a localized title and keeps the old track', async () => {
    switchAudioTrackMock.mockResolvedValue({
      success: false,
      error: {
        type: 'api_unsupported',
        message: 'HLS instance not available',
        trackIndex: JAPANESE_INDEX,
      },
    } as never)

    const { result } = renderTrackManager(createVideo())

    let switched = true
    await act(async () => {
      switched = await result.current.selectAudioTrack(JAPANESE_INDEX)
    })

    expect(switched).toBe(false)
    expect(result.current.error).toBe('HLS instance not available')
    expect(showErrorMock).toHaveBeenCalledWith(
      'player.tracks.error.switchFailed',
      'HLS instance not available',
    )
    expect(result.current.trackState.activeAudioIndex).toBe(
      DEFAULT_ENGLISH_INDEX,
    )
    expect(result.current.isLoading).toBe(false)
  })

  it('reports a thrown switch error and clears the pending flag', async () => {
    switchAudioTrackMock.mockRejectedValue(new Error('boom'))

    const { result } = renderTrackManager(createVideo())

    let switched = true
    await act(async () => {
      switched = await result.current.selectAudioTrack(JAPANESE_INDEX)
    })

    expect(switched).toBe(false)
    expect(result.current.error).toBe('boom')
    expect(showErrorMock).toHaveBeenCalledWith(
      'player.tracks.error.switchFailed',
      'boom',
    )
    expect(result.current.isLoading).toBe(false)
  })

  it('rejects a second operation while one is pending', async () => {
    let resolveSwitch: ((result: unknown) => void) | undefined
    switchAudioTrackMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSwitch = resolve
        }) as never,
    )

    const { result } = renderTrackManager(createVideo())

    let firstSwitch: Promise<boolean> | undefined
    act(() => {
      firstSwitch = result.current.selectAudioTrack(JAPANESE_INDEX)
    })
    expect(result.current.isLoading).toBe(true)

    let second = true
    await act(async () => {
      second = await result.current.selectAudioTrack(ENGLISH_COMMENTARY_INDEX)
    })
    expect(second).toBe(false)
    expect(switchAudioTrackMock).toHaveBeenCalledTimes(1)

    let blockedSubtitle = true
    await act(async () => {
      blockedSubtitle = await result.current.selectSubtitleTrack(
        SPANISH_SUBTITLE_INDEX,
      )
    })
    expect(blockedSubtitle).toBe(false)
    expect(switchSubtitleTrackMock).not.toHaveBeenCalled()

    let first = false
    await act(async () => {
      resolveSwitch?.({ success: true })
      first = (await firstSwitch) === true
    })
    expect(first).toBe(true)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.trackState.activeAudioIndex).toBe(JAPANESE_INDEX)
  })

  it('ignores a switch that resolves after unmount', async () => {
    let resolveSwitch: ((result: unknown) => void) | undefined
    switchAudioTrackMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSwitch = resolve
        }) as never,
    )

    const { result, unmount } = renderTrackManager(createVideo())

    let pendingSwitch: Promise<boolean> | undefined
    act(() => {
      pendingSwitch = result.current.selectAudioTrack(JAPANESE_INDEX)
    })

    unmount()

    await act(async () => {
      resolveSwitch?.({
        success: false,
        error: {
          type: 'unknown_error',
          message: 'stale failure',
          trackIndex: JAPANESE_INDEX,
        },
      })
      await pendingSwitch
    })

    expect(showErrorMock).not.toHaveBeenCalled()
  })

  it('records subtitle selections and can turn them off again', async () => {
    const { result } = renderTrackManager(createVideo())

    expect(result.current.trackState.activeSubtitleIndex).toBeNull()

    let enabled = false
    await act(async () => {
      enabled = await result.current.selectSubtitleTrack(SPANISH_SUBTITLE_INDEX)
    })
    expect(enabled).toBe(true)
    expect(result.current.trackState.activeSubtitleIndex).toBe(
      SPANISH_SUBTITLE_INDEX,
    )

    let disabled = false
    await act(async () => {
      disabled = await result.current.selectSubtitleTrack(null)
    })
    expect(disabled).toBe(true)
    expect(result.current.trackState.activeSubtitleIndex).toBeNull()
  })
})
