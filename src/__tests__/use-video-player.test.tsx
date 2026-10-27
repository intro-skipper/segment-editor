// @vitest-environment jsdom
/**
 * The thin hook over PlaybackEngine: what the player overlays read from it
 * and the order its effects hand item and sync changes to the engine.
 */

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BaseItemDto } from '@/types/jellyfin'
import type * as VideoApiModule from '@/services/video/api'
import { getPlaybackConfig } from '@/services/video/api'
import { startPlaybackStatus } from '@/services/video/playback-session'
import { useVideoPlayer } from '@/hooks/use-video-player'
import {
  FakeHls,
  createItem,
  createVideo,
  deferred,
  latestHls,
  settle,
} from './helpers/playback-fakes'

vi.mock('hls.js', async () => ({
  default: (await import('./helpers/playback-fakes')).FakeHls,
}))

vi.mock('@/services/video/api', async (importOriginal) => ({
  ...(await importOriginal<typeof VideoApiModule>()),
  getPlaybackConfig: vi.fn(),
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

const t = (key: string) => key

interface HookProps {
  item: BaseItemDto | null
  jellyfinPlaybackSyncEnabled: boolean
}

function renderPlayer(item: BaseItemDto, jellyfinPlaybackSyncEnabled = false) {
  const hook = renderHook(
    (props: HookProps) => useVideoPlayer({ ...props, t }),
    {
      initialProps: { item, jellyfinPlaybackSyncEnabled },
    },
  )
  // Playback reaches the element only once the config resolves.
  hook.result.current.videoRef.current = createVideo()
  return hook
}

beforeEach(() => {
  FakeHls.instances.length = 0
  vi.mocked(getPlaybackConfig).mockImplementation(async (item) => ({
    strategy: 'hls',
    url: `https://jellyfin.example/Videos/${item.Id}/master.m3u8`,
  }))
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('useVideoPlayer', () => {
  it('is loading, without an error, while the config resolves', async () => {
    const config = deferred<{ strategy: 'hls'; url: string }>()
    vi.mocked(getPlaybackConfig).mockReturnValueOnce(config.promise)
    const { result } = renderPlayer(createItem())

    expect(result.current).toMatchObject({
      isLoading: true,
      error: null,
      isRecovering: false,
    })

    await act(async () => {
      config.resolve({
        strategy: 'hls',
        url: 'https://jellyfin.example/1.m3u8',
      })
      await settle()
    })
    expect(result.current).toMatchObject({
      isLoading: false,
      videoUrl: 'https://jellyfin.example/1.m3u8',
    })
  })

  it('shows a recovering error behind the spinner, and a failed one with Retry', async () => {
    const { result } = renderPlayer(createItem())
    await act(settle)

    act(() => {
      latestHls().emit(FakeHls.Events.ERROR, {
        fatal: true,
        type: FakeHls.ErrorTypes.NETWORK_ERROR,
      })
    })
    expect(result.current).toMatchObject({
      isRecovering: true,
      error: { type: 'network_error' },
    })

    act(() => {
      latestHls().emit(FakeHls.Events.ERROR, {
        fatal: true,
        type: 'otherError',
      })
    })
    expect(result.current).toMatchObject({
      isRecovering: false,
      error: { type: 'unknown_error', recoverable: true },
    })
  })

  it('reports only the new item when sync turns on in the same render', async () => {
    vi.mocked(getPlaybackConfig).mockImplementation(async (item) => ({
      strategy: 'direct',
      url: `https://jellyfin.example/Videos/${item.Id}/stream`,
    }))
    const { rerender } = renderPlayer(createItem())
    await act(settle)

    rerender({ item: createItem('item-2'), jellyfinPlaybackSyncEnabled: true })
    await act(settle)

    expect(startPlaybackStatus).toHaveBeenCalledTimes(1)
    expect(startPlaybackStatus).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item-2' }),
    )
  })
})
