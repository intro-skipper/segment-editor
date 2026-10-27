// @vitest-environment jsdom
/**
 * The hook that owns the editor's PlaybackEngine: the order its effects hand
 * item and sync changes to the engine.
 */

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import type { BaseItemDto } from '@/types/jellyfin'
import type * as VideoApiModule from '@/services/video/api'
import { getPlaybackConfig } from '@/services/video/api'
import { startPlaybackStatus } from '@/services/video/playback-session'
import { usePlaybackSession } from '@/hooks/use-playback-session'
import { useAppStore } from '@/stores/app-store'
import { createItem, createVideo, settle } from './helpers/playback-fakes'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

/** The hook with a <video> connected, as Player connects it. */
function renderSession(item: BaseItemDto) {
  const hook = renderHook(
    (props: { item: BaseItemDto }) => usePlaybackSession(props),
    { initialProps: { item } },
  )
  const { engine, videoRef } = hook.result.current
  videoRef.current = createVideo()
  let disconnect = () => {}
  act(() => {
    disconnect = engine.connect()
  })
  onTestFinished(disconnect)
  return hook
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  useAppStore.setState({ jellyfinPlaybackSyncEnabled: false })
})

describe('usePlaybackSession', () => {
  it('reports only the new item when sync turns on in the same render', async () => {
    vi.mocked(getPlaybackConfig).mockImplementation(async (item) => ({
      strategy: 'direct',
      url: `https://jellyfin.example/Videos/${item.Id}/stream`,
    }))
    const { rerender } = renderSession(createItem())
    await act(settle)

    act(() => {
      useAppStore.setState({ jellyfinPlaybackSyncEnabled: true })
      rerender({ item: createItem('item-2') })
    })
    await act(settle)

    expect(startPlaybackStatus).toHaveBeenCalledTimes(1)
    expect(startPlaybackStatus).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item-2' }),
    )
  })
})
