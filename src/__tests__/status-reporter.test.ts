/**
 * The Jellyfin status reporter's state machine, against a fake backend:
 * starts that resolve after their session moved on, and the positions stops
 * carry when the video is gone or belongs to the next item.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest'
import type {
  JellyfinSessionDescriptor,
  JellyfinStatusBackend,
} from '@/services/video/status-reporter'
import { PlaybackStatusReporter } from '@/services/video/status-reporter'

function fakeBackend() {
  let resolveStart = () => {}
  const backend = {
    start: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveStart = resolve
        }),
    ),
    progress: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    stopKeepalive: vi.fn(),
    stopEncoding: vi.fn(async () => {}),
    stopEncodingKeepalive: vi.fn(),
  } satisfies JellyfinStatusBackend
  return { backend, resolveStart: () => resolveStart() }
}

const session = (
  overrides: Partial<JellyfinSessionDescriptor> = {},
): JellyfinSessionDescriptor => ({
  itemId: 'item-1',
  mediaSourceId: 'item-1-media-source',
  playSessionId: 'hls-session-1',
  strategy: 'hls',
  syncEnabled: true,
  ...overrides,
})

function videoAt(seconds: number): HTMLVideoElement {
  const video = document.createElement('video')
  video.currentTime = seconds
  return video
}

describe('PlaybackStatusReporter', () => {
  it('stops a pending start at its position when the video is gone by then', async () => {
    const { backend, resolveStart } = fakeBackend()
    let video: HTMLVideoElement | null = videoAt(12)
    const reporter = new PlaybackStatusReporter(backend, () => video, session())

    const started = reporter.start()
    expect(backend.start).toHaveBeenCalledWith(
      expect.objectContaining({ positionTicks: 120_000_000 }),
    )
    video = null
    await reporter.stop()
    resolveStart()
    await started

    expect(backend.stop).toHaveBeenCalledWith(
      expect.objectContaining({
        playSessionId: 'hls-session-1',
        positionTicks: 120_000_000,
      }),
    )
  })

  it('keeps a stale pending keepalive stop on the original session position after an item change', async () => {
    const { backend, resolveStart } = fakeBackend()
    let video: HTMLVideoElement | null = videoAt(12)
    const getVideo = () => video
    const reporter = new PlaybackStatusReporter(backend, getVideo, session())

    const started = reporter.start()
    video = videoAt(99)
    reporter.update(
      session({
        itemId: 'item-2',
        mediaSourceId: 'item-2-media-source',
        playSessionId: 'hls-session-2',
      }),
      getVideo,
    )
    reporter.stopAllKeepalive()

    expect(backend.stopKeepalive).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item-1',
        mediaSourceId: 'item-1-media-source',
        playSessionId: 'hls-session-1',
        positionTicks: 120_000_000,
      }),
    )

    resolveStart()
    await started
    expect(backend.stop).not.toHaveBeenCalled()
  })

  it('stops instead of promoting a pending start after sync turns off', async () => {
    const { backend, resolveStart } = fakeBackend()
    const getVideo = () => videoAt(12)
    const reporter = new PlaybackStatusReporter(backend, getVideo, session())

    const started = reporter.start()
    reporter.update(session({ syncEnabled: false }), getVideo)
    resolveStart()
    await started

    expect(backend.stop).toHaveBeenCalledWith(
      expect.objectContaining({
        playSessionId: 'hls-session-1',
        positionTicks: 120_000_000,
      }),
    )
  })
})
