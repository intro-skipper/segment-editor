// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BaseItemDto } from '@/types/jellyfin'
import type {
  TrackSwitchResult,
  applyInitialAudioTrack,
  switchAudioTrack,
  switchSubtitleTrack,
} from '@/services/video/track-switching'
import { useTrackManager } from '@/hooks/use-track-manager'
import { useAppStore } from '@/stores/app-store'

const applyInitialAudioTrackMock = vi.hoisted(() =>
  vi.fn<typeof applyInitialAudioTrack>(() =>
    Promise.resolve({ success: true }),
  ),
)
const switchAudioTrackMock = vi.hoisted(() =>
  vi.fn<typeof switchAudioTrack>(() => Promise.resolve({ success: true })),
)
const switchSubtitleTrackMock = vi.hoisted(() =>
  vi.fn<typeof switchSubtitleTrack>(() => Promise.resolve({ success: true })),
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

function createItem(id = 'item-1'): BaseItemDto {
  return {
    Id: id,
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
  return renderHook(
    ({ item }: { item: BaseItemDto }) =>
      useTrackManager({
        item,
        // HLS strategy keeps the initial direct-play application inert so these
        // tests exercise only the manual selection path.
        strategy: 'hls',
        videoRef,
        t: (key: string) => key,
        onReloadHls: vi.fn(),
      }),
    { initialProps: { item: createItem() } },
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
    })

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
    let resolveSwitch: ((result: TrackSwitchResult) => void) | undefined
    switchAudioTrackMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSwitch = resolve
        }),
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

  it('admits only one of two selections issued in the same turn', async () => {
    let resolveSwitch: ((result: TrackSwitchResult) => void) | undefined
    switchAudioTrackMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSwitch = resolve
        }),
    )

    const { result } = renderTrackManager(createVideo())

    // Both calls run before React commits any state update, so a render-state
    // guard would admit both. The contract says the second is rejected.
    let first: Promise<boolean> | undefined
    let second: Promise<boolean> | undefined
    act(() => {
      first = result.current.selectAudioTrack(JAPANESE_INDEX)
      second = result.current.selectAudioTrack(ENGLISH_COMMENTARY_INDEX)
    })

    expect(switchAudioTrackMock).toHaveBeenCalledTimes(1)
    expect(switchAudioTrackMock).toHaveBeenCalledWith(
      JAPANESE_INDEX,
      expect.anything(),
    )

    let firstSwitched = false
    let secondSwitched = true
    await act(async () => {
      resolveSwitch?.({ success: true })
      firstSwitched = (await first) === true
      secondSwitched = (await second) === true
    })

    expect(firstSwitched).toBe(true)
    expect(secondSwitched).toBe(false)
    expect(result.current.trackState.activeAudioIndex).toBe(JAPANESE_INDEX)
    expect(result.current.isLoading).toBe(false)
  })

  it('aborts a pending switch when the item changes and drops its outcome', async () => {
    let resolveSwitch: ((result: TrackSwitchResult) => void) | undefined
    let capturedSignal: AbortSignal | undefined
    switchAudioTrackMock.mockImplementation(
      (_index: number, options: { signal?: AbortSignal }) => {
        capturedSignal = options.signal
        return new Promise((resolve) => {
          resolveSwitch = resolve
        })
      },
    )

    const { result, rerender } = renderTrackManager(createVideo())

    let pendingSwitch: Promise<boolean> | undefined
    act(() => {
      pendingSwitch = result.current.selectAudioTrack(JAPANESE_INDEX)
    })
    expect(capturedSignal?.aborted).toBe(false)

    // Navigating to another item must invalidate the in-flight operation: the
    // service consults this signal before enabling a native track or
    // reloading HLS, so a still-live signal would let the stale switch act on
    // the new item's stream.
    rerender({ item: createItem('item-2') })
    expect(capturedSignal?.aborted).toBe(true)

    let switched = true
    await act(async () => {
      resolveSwitch?.({ success: true })
      switched = (await pendingSwitch) === true
    })

    // The stale operation commits nothing: no selection, no error, no toast.
    expect(switched).toBe(false)
    expect(result.current.trackState.activeAudioIndex).toBe(
      DEFAULT_ENGLISH_INDEX,
    )
    expect(result.current.error).toBeNull()
    expect(showErrorMock).not.toHaveBeenCalled()
    expect(result.current.isLoading).toBe(false)
  })

  it('ignores a switch that resolves after unmount', async () => {
    let resolveSwitch: ((result: TrackSwitchResult) => void) | undefined
    switchAudioTrackMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSwitch = resolve
        }),
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
