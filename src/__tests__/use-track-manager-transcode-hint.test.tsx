// @vitest-environment jsdom

import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BaseItemDto } from '@/types/jellyfin'
import type { PlaybackStrategy } from '@/services/video/api'
import { useTrackManager } from '@/hooks/use-track-manager'
import { isCodecSupported } from '@/services/video/compatibility'
import { supportsNativeAudioTrackSwitching } from '@/services/video/capabilities'

vi.mock('@/services/video/track-switching', () => ({
  applyInitialAudioTrack: vi.fn(() => Promise.resolve({ success: true })),
  switchAudioTrack: vi.fn(() => Promise.resolve({ success: true })),
  switchSubtitleTrack: vi.fn(() => Promise.resolve({ success: true })),
}))

vi.mock('@/lib/notifications', () => ({
  showError: vi.fn(),
}))

vi.mock('@/services/video/capabilities', () => ({
  supportsNativeAudioTrackSwitching: vi.fn(() => true),
}))

vi.mock('@/services/video/compatibility', async (importOriginal) => {
  const { mockCompatibilityWithProbe } =
    await import('@/__tests__/helpers/audio-decodability-mock')
  return mockCompatibilityWithProbe(importOriginal)
})

const AAC_DEFAULT_INDEX = 1
const EAC3_INDEX = 2
const DTS_INDEX = 3

function createItem(
  streams: Array<{ index: number; codec: string; isDefault?: boolean }>,
): BaseItemDto {
  return {
    Id: 'item-1',
    Name: 'Multi audio item',
    MediaSources: [
      {
        Id: 'source-1',
        Container: 'mkv',
        MediaStreams: [
          { Type: 'Video', Index: 0, Codec: 'h264' },
          ...streams.map((stream) => ({
            Type: 'Audio' as const,
            Index: stream.index,
            Codec: stream.codec,
            Channels: 6,
            IsDefault: stream.isDefault ?? false,
          })),
        ],
      },
    ],
  }
}

function renderTrackManager(item: BaseItemDto, strategy: PlaybackStrategy) {
  const videoRef = { current: document.createElement('video') }
  return renderHook(() =>
    useTrackManager({
      item,
      strategy,
      videoRef,
      t: (key: string) => key,
      onReloadHls: vi.fn(),
    }),
  )
}

describe('useTrackManager audio switch transcode scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(supportsNativeAudioTrackSwitching).mockReturnValue(true)
    vi.mocked(isCodecSupported).mockResolvedValue(true)
  })

  afterEach(() => {
    cleanup()
  })

  it('reports none for HLS playback', () => {
    const { result } = renderTrackManager(
      createItem([
        { index: AAC_DEFAULT_INDEX, codec: 'aac', isDefault: true },
        { index: DTS_INDEX, codec: 'dts' },
      ]),
      'hls',
    )

    expect(result.current.audioSwitchTranscodeScope).toBe('none')
  })

  it('reports all when the native switching API is unavailable', () => {
    vi.mocked(supportsNativeAudioTrackSwitching).mockReturnValue(false)

    const { result } = renderTrackManager(
      createItem([
        { index: AAC_DEFAULT_INDEX, codec: 'aac', isDefault: true },
        { index: EAC3_INDEX, codec: 'aac' },
      ]),
      'direct',
    )

    expect(result.current.audioSwitchTranscodeScope).toBe('all')
  })

  it('reports none when every switch target decodes natively', async () => {
    const { result } = renderTrackManager(
      createItem([
        { index: AAC_DEFAULT_INDEX, codec: 'aac', isDefault: true },
        { index: EAC3_INDEX, codec: 'aac' },
      ]),
      'direct',
    )

    await waitFor(() => {
      expect(isCodecSupported).toHaveBeenCalled()
    })
    expect(result.current.audioSwitchTranscodeScope).toBe('none')
  })

  it('counts a listed codec the decoder probe rejects as a transcode target', async () => {
    // E-AC-3 on a Chromium build without proprietary decoders: passes the
    // static allowlist, fails the same probe the switch path runs.
    // isCodecSupported receives the extracted track codec ('EAC3') and
    // normalizes internally, so the mock compares case-insensitively.
    vi.mocked(isCodecSupported).mockImplementation((codec) =>
      Promise.resolve(codec.toLowerCase() !== 'eac3'),
    )

    const { result } = renderTrackManager(
      createItem([
        { index: AAC_DEFAULT_INDEX, codec: 'aac', isDefault: true },
        { index: EAC3_INDEX, codec: 'eac3' },
      ]),
      'direct',
    )

    await waitFor(() => {
      expect(result.current.audioSwitchTranscodeScope).toBe('all')
    })
  })

  it('reports some when only part of the targets restart the stream', async () => {
    const { result } = renderTrackManager(
      createItem([
        { index: AAC_DEFAULT_INDEX, codec: 'aac', isDefault: true },
        { index: EAC3_INDEX, codec: 'aac' },
        { index: DTS_INDEX, codec: 'dts' },
      ]),
      'direct',
    )

    await waitFor(() => {
      expect(isCodecSupported).toHaveBeenCalled()
    })
    // AAC → AAC switches natively; only the DTS target restarts the stream.
    expect(result.current.audioSwitchTranscodeScope).toBe('some')
  })

  it('ignores the active track when aggregating targets', async () => {
    // With the DTS track playing, the only switch target is the AAC track,
    // which switches natively — no hint is due.
    const { result } = renderTrackManager(
      createItem([
        { index: DTS_INDEX, codec: 'dts', isDefault: true },
        { index: AAC_DEFAULT_INDEX, codec: 'aac' },
      ]),
      'direct',
    )

    await waitFor(() => {
      expect(isCodecSupported).toHaveBeenCalled()
    })
    expect(result.current.audioSwitchTranscodeScope).toBe('none')
  })
})
