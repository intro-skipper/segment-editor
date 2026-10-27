// @vitest-environment jsdom
/**
 * The thin hook over PlaybackEngine: the order its effects hand item and sync
 * changes to the engine.
 */

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BaseItemDto } from '@/types/jellyfin'
import type * as VideoApiModule from '@/services/video/api'
import { getPlaybackConfig } from '@/services/video/api'
import { startPlaybackStatus } from '@/services/video/playback-session'
import { useVideoPlayer } from '@/hooks/use-video-player'
import { createItem, createVideo, settle } from './helpers/playback-fakes'

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

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('useVideoPlayer', () => {
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
