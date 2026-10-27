/**
 * @vitest-environment jsdom
 */

import { createRef } from 'react'
import { asElement } from './helpers/dom'
import { isTranslationOptions, resolveTranslation } from './helpers/i18n-mock'
import type { TranslationArg } from './helpers/i18n-mock'
import {
  FakeHls,
  createItem,
  createPlayback,
  latestHls,
  settle,
} from './helpers/playback-fakes'
import type { ComponentProps } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PlayerSurface } from '@/components/player/PlayerSurface'
import { PlaybackProvider } from '@/components/player/playback-context'
import type { MediaSegmentDto } from '@/types/jellyfin'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, optionsOrFallback?: TranslationArg) => {
      if (key.startsWith('segmentType.')) return `type:${key.slice(12)}`
      if (
        key === 'player.skipSegment' &&
        isTranslationOptions(optionsOrFallback)
      ) {
        return `Skip ${optionsOrFallback.type}`
      }
      return resolveTranslation(key, optionsOrFallback)
    },
  }),
}))

const skipSegment: MediaSegmentDto = {
  Id: 'segment-1',
  Type: 'Intro',
  StartTicks: 10,
  EndTicks: 20,
}

type SurfaceProps = ComponentProps<typeof PlayerSurface>

interface SurfacePropOverrides {
  fullscreen?: Partial<SurfaceProps['fullscreen']>
  video?: Partial<SurfaceProps['video']>
}

function createProps(overrides: SurfacePropOverrides = {}): SurfaceProps {
  return {
    containerRef: createRef<HTMLDivElement>(),
    videoRef: createRef<HTMLVideoElement>(),
    fullscreen: {
      isFullscreen: false,
      showControls: true,
      videoFitMode: 'contain',
      onMouseMove: vi.fn(),
      onMouseLeave: vi.fn(),
      onToggleVideoFitMode: vi.fn(),
      ...overrides.fullscreen,
    },
    video: {
      posterUrl: null,
      captionTracks: [
        {
          index: 1,
          language: 'eng',
          label: 'English',
          src: '/caption-1.vtt',
        },
        {
          index: 2,
          language: 'spa',
          label: 'Spanish',
          src: '/caption-2.vtt',
        },
      ],
      onInteraction: vi.fn(),
      ...overrides.video,
    },
    controls: <div data-testid="player-controls" />,
    timelineScrubber: <div data-testid="timeline-scrubber" />,
  }
}

type Playback = ReturnType<typeof createPlayback>

/** Renders the surface over `playback`'s engine, by default one still resolving its config. */
function renderSurface(
  overrides: SurfacePropOverrides = {},
  playback: Playback = createPlayback(),
) {
  const props = createProps(overrides)
  const utils = render(
    <PlaybackProvider engine={playback.engine}>
      <PlayerSurface {...props} />
    </PlaybackProvider>,
  )
  const rerender = (next: SurfacePropOverrides) => {
    utils.rerender(
      <PlaybackProvider engine={playback.engine}>
        <PlayerSurface {...createProps(next)} />
      </PlaybackProvider>,
    )
  }
  return { ...utils, props, rerender }
}

/** An engine playing an HLS stream, whose failure reads "Playback failed". */
async function playingHls(): Promise<Playback> {
  const playback = createPlayback({
    host: {
      t: (key) => (key === 'player.error.unknown' ? 'Playback failed' : key),
    },
  })
  playback.engine.load(createItem())
  await settle()
  return playback
}

/** hls.js reports an error it cannot recover from, so playback waits for Retry. */
function failHls() {
  act(() => {
    latestHls().emit(FakeHls.Events.ERROR, { fatal: true, type: 'otherError' })
  })
}

beforeEach(() => {
  FakeHls.instances.length = 0
})

afterEach(() => {
  cleanup()
})

describe('PlayerSurface', () => {
  it('renders captions, inline controls, and the segment skip action', async () => {
    const playback = await playingHls()
    playback.engine.playhead.setSegments([skipSegment])
    const { container } = renderSurface({}, playback)

    const tracks = Array.from(container.querySelectorAll('track'))
    expect(tracks.map((track) => track.getAttribute('src'))).toEqual([
      '/caption-1.vtt',
      '/caption-2.vtt',
    ])
    expect(screen.getByTestId('timeline-scrubber')).toBeTruthy()
    expect(screen.getByTestId('player-controls')).toBeTruthy()

    playback.video.currentTime = 12
    act(() => {
      playback.video.dispatchEvent(new Event('timeupdate'))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Skip type:Intro' }))

    expect(playback.video.currentTime).toBe(20)
    expect(screen.queryByRole('button', { name: 'Skip type:Intro' })).toBe(null)
  })

  it('renders fullscreen controls, hides inline scrubber, and exposes hidden-control state', () => {
    const onToggleVideoFitMode = vi.fn()
    const { container } = renderSurface({
      fullscreen: {
        isFullscreen: true,
        showControls: false,
        onToggleVideoFitMode,
      },
    })

    expect(screen.getByTestId('timeline-scrubber')).toBeTruthy()

    const overlay = screen
      .getByTestId('timeline-scrubber')
      .closest('[aria-hidden]')
    expect(overlay?.getAttribute('aria-hidden')).toBe('true')
    expect(overlay?.hasAttribute('inert')).toBe(true)

    fireEvent.click(
      asElement(
        container.querySelector('[aria-label="Fill screen"]'),
        HTMLElement,
      ),
    )

    expect(onToggleVideoFitMode).toHaveBeenCalledTimes(1)
  })

  it('wires section and video interaction, and plays on Enter', () => {
    const playback = createPlayback()
    const { container, props } = renderSurface({}, playback)

    const section = container.querySelector('section')
    const videoButton = screen.getByRole('button', {
      name: 'player.videoPlayer',
    })
    if (!section) throw new Error('Expected rendered player surface')

    fireEvent.mouseMove(section)
    fireEvent.mouseLeave(section)
    fireEvent.click(videoButton)
    fireEvent.touchEnd(videoButton)
    fireEvent.keyDown(videoButton, { key: 'a' })
    fireEvent.keyDown(videoButton, { key: 'Enter' })

    expect(props.fullscreen.onMouseMove).toHaveBeenCalledTimes(1)
    expect(props.fullscreen.onMouseLeave).toHaveBeenCalledTimes(1)
    expect(props.video.onInteraction).toHaveBeenCalledTimes(2)
    expect(playback.video.play).toHaveBeenCalledTimes(1)
  })

  it('rounds the windowed surface and layers the blurred poster backdrop', () => {
    const { container } = renderSurface({
      video: { posterUrl: '/poster.jpg' },
    })

    const videoButton = screen.getByRole('button', {
      name: 'player.videoPlayer',
    })
    expect(videoButton.classList.contains('rounded-2xl')).toBe(true)
    expect(videoButton.classList.contains('aspect-video')).toBe(true)

    const video = container.querySelector('video')
    if (!video) throw new Error('Expected video element')
    expect(video.classList.contains('rounded-2xl')).toBe(true)

    const backdrop = container.querySelector('img')
    if (!backdrop) throw new Error('Expected blurred poster backdrop')
    expect(backdrop.getAttribute('src')).toBe('/poster.jpg')
    expect(backdrop.classList.contains('blur-2xl')).toBe(true)

    const backdropClip = backdrop.parentElement
    if (!backdropClip) throw new Error('Expected backdrop clipping wrapper')
    expect(backdropClip.getAttribute('aria-hidden')).toBe('true')
    expect(backdropClip.classList.contains('overflow-clip')).toBe(true)
    expect(backdropClip.classList.contains('rounded-2xl')).toBe(true)
    // The clipping wrapper must only ever contain the backdrop, never the
    // video (see the JASSUB black-frame guard below).
    expect(backdropClip.contains(video)).toBe(false)
  })

  it('never clips the video behind an overflow-clipping ancestor (JASSUB black-frame guard)', () => {
    // Chromium renders hardware-decoded video black when an ancestor
    // border-radius + overflow clip (hidden or clip, any axis) has to mask
    // the composited JASSUB subtitle canvas layered above the video.
    const overflowClipClass = /\boverflow-(?:x-|y-)?(?:hidden|clip)\b/
    const { container } = renderSurface({
      video: { posterUrl: '/poster.jpg' },
    })

    const video = container.querySelector('video')
    if (!video) throw new Error('Expected video element')

    for (let node = video.parentElement; node; node = node.parentElement) {
      expect(node.getAttribute('class') ?? '').not.toMatch(overflowClipClass)
    }
  })

  it('drops the rounded frame and poster backdrop in fullscreen', () => {
    const { container } = renderSurface({
      video: { posterUrl: '/poster.jpg' },
      fullscreen: { isFullscreen: true },
    })

    const videoButton = screen.getByRole('button', {
      name: 'player.videoPlayer',
    })
    expect(videoButton.classList.contains('rounded-2xl')).toBe(false)
    expect(videoButton.classList.contains('overflow-clip')).toBe(false)
    expect(videoButton.classList.contains('overflow-hidden')).toBe(false)

    expect(container.querySelector('img')).toBe(null)
  })

  it('rounds the error overlay only in windowed mode', async () => {
    const { rerender } = renderSurface({}, await playingHls())
    failHls()

    const windowedOverlay = screen.getByText('Playback failed').parentElement
    if (!windowedOverlay) throw new Error('Expected error overlay')
    expect(windowedOverlay.classList.contains('rounded-2xl')).toBe(true)

    rerender({ fullscreen: { isFullscreen: true } })

    const fullscreenOverlay = screen.getByText('Playback failed').parentElement
    if (!fullscreenOverlay) throw new Error('Expected error overlay')
    expect(fullscreenOverlay.classList.contains('rounded-2xl')).toBe(false)
  })

  it('rounds the loading overlay only in windowed mode', () => {
    const { container, rerender } = renderSurface()

    const windowedOverlay = container.querySelector('output')
    if (!windowedOverlay) throw new Error('Expected loading overlay')
    expect(windowedOverlay.classList.contains('rounded-2xl')).toBe(true)
    expect(screen.queryByRole('alert')).toBe(null)

    rerender({ fullscreen: { isFullscreen: true } })

    const fullscreenOverlay = container.querySelector('output')
    if (!fullscreenOverlay) throw new Error('Expected loading overlay')
    expect(fullscreenOverlay.classList.contains('rounded-2xl')).toBe(false)
  })

  it('shows a recovering error as the loading overlay, not as an error', async () => {
    const { container } = renderSurface({}, await playingHls())
    expect(container.querySelector('output')).toBe(null)

    act(() => {
      latestHls().emit(FakeHls.Events.ERROR, {
        fatal: true,
        type: FakeHls.ErrorTypes.MEDIA_ERROR,
      })
    })

    expect(container.querySelector('output')?.textContent).toBe(
      'Recovering playback',
    )
    expect(screen.queryByRole('alert')).toBe(null)
  })

  it('renders a recoverable error without the skip action, and Retry restarts playback', async () => {
    const playback = await playingHls()
    playback.engine.playhead.setSegments([skipSegment])
    renderSurface({}, playback)
    playback.video.currentTime = 12
    act(() => {
      playback.video.dispatchEvent(new Event('timeupdate'))
    })
    expect(screen.getByRole('button', { name: 'Skip type:Intro' })).toBeTruthy()

    failHls()

    expect(screen.getByText('Playback failed')).toBeTruthy()
    // The overlay must not repeat the failure message as a separate hint line.
    expect(screen.queryByText('player.error.unknown')).toBe(null)
    expect(screen.queryByRole('button', { name: 'Skip type:Intro' })).toBe(null)

    fireEvent.click(screen.getByRole('button', { name: 'player.retry' }))
    await act(settle)

    expect(screen.queryByRole('alert')).toBe(null)
    expect(FakeHls.instances).toHaveLength(2)
    expect(latestHls().config.startPosition).toBe(12)
  })
})
