/**
 * @vitest-environment jsdom
 */

import { createRef } from 'react'
import type { ComponentProps } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PlayerSurface } from '@/components/player/PlayerSurface'
import type { PlayerControlsProps } from '@/components/player/PlayerControls'
import type { MediaSegmentDto } from '@/types/jellyfin'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, optionsOrFallback?: string | { type?: string }) => {
      if (key.startsWith('segmentType.')) return `type:${key.slice(12)}`
      if (
        key === 'player.skipSegment' &&
        typeof optionsOrFallback === 'object'
      ) {
        return `Skip ${optionsOrFallback.type}`
      }
      return typeof optionsOrFallback === 'string' ? optionsOrFallback : key
    },
  }),
}))

vi.mock('@/components/player/PlayerControls', () => ({
  PlayerControls: () => <div data-testid="player-controls" />,
}))

const playerControlsProps: PlayerControlsProps = {
  playback: {
    state: 'paused',
    onToggle: vi.fn(),
  },
  volumeControls: {
    state: 'audible',
    level: 0.8,
    onToggleMute: vi.fn(),
    onChange: vi.fn(),
  },
  segmentCreation: {
    onCreate: vi.fn(),
  },
  skipControls: {
    timeIndex: 0,
    onTimeChange: vi.fn(),
  },
  display: {
    mode: 'inline',
  },
  settings: {
    subtitleOffset: 0,
    subtitleState: 'inactive',
  },
}

const skipSegment = {
  Id: 'segment-1',
  Type: 'Intro',
  StartTicks: 10,
  EndTicks: 20,
} as MediaSegmentDto

type SurfaceProps = ComponentProps<typeof PlayerSurface>

interface SurfacePropOverrides {
  className?: SurfaceProps['className']
  containerRef?: SurfaceProps['containerRef']
  videoRef?: SurfaceProps['videoRef']
  fullscreen?: Partial<SurfaceProps['fullscreen']>
  video?: Partial<SurfaceProps['video']>
  playback?: Partial<SurfaceProps['playback']>
  segmentSkip?: Partial<NonNullable<SurfaceProps['segmentSkip']>> | null
  controlsProps?: SurfaceProps['controlsProps']
  timelineScrubber?: SurfaceProps['timelineScrubber']
}

function createProps(overrides: SurfacePropOverrides = {}): SurfaceProps {
  return {
    className: overrides.className,
    containerRef: overrides.containerRef ?? createRef<HTMLDivElement>(),
    videoRef: overrides.videoRef ?? createRef<HTMLVideoElement>(),
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
      onKeyDown: vi.fn(),
      onTimeUpdate: vi.fn(),
      onDurationChange: vi.fn(),
      onProgress: vi.fn(),
      onPlay: vi.fn(),
      onPause: vi.fn(),
      ...overrides.video,
    },
    playback: {
      error: null,
      isRecovering: false,
      strategy: 'direct',
      isVideoLoading: false,
      onRetry: vi.fn(),
      ...overrides.playback,
    },
    segmentSkip:
      overrides.segmentSkip === null
        ? null
        : {
            segment: skipSegment,
            onSkipSegment: vi.fn(),
            ...overrides.segmentSkip,
          },
    controlsProps: overrides.controlsProps ?? playerControlsProps,
    timelineScrubber: overrides.timelineScrubber ?? (
      <div data-testid="timeline-scrubber" />
    ),
  }
}

afterEach(() => {
  cleanup()
})

describe('PlayerSurface', () => {
  it('renders captions, inline controls, and the segment skip action', () => {
    const onSkipSegment = vi.fn()
    const { container } = render(
      <PlayerSurface
        {...createProps({
          segmentSkip: { onSkipSegment },
        })}
      />,
    )

    const tracks = Array.from(container.querySelectorAll('track'))
    expect(tracks.map((track) => track.getAttribute('src'))).toEqual([
      '/caption-1.vtt',
      '/caption-2.vtt',
    ])
    expect(screen.getByTestId('timeline-scrubber')).toBeTruthy()
    expect(screen.getByTestId('player-controls')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Skip type:Intro' }))

    expect(onSkipSegment).toHaveBeenCalledWith(skipSegment)
  })

  it('renders fullscreen controls, hides inline scrubber, and exposes hidden-control state', () => {
    const onToggleVideoFitMode = vi.fn()
    const { container } = render(
      <PlayerSurface
        {...createProps({
          fullscreen: {
            isFullscreen: true,
            showControls: false,
            onToggleVideoFitMode,
          },
        })}
      />,
    )

    expect(screen.getByTestId('timeline-scrubber')).toBeTruthy()

    const overlay = screen
      .getByTestId('timeline-scrubber')
      .closest('[aria-hidden]')
    expect(overlay?.getAttribute('aria-hidden')).toBe('true')
    expect(overlay?.hasAttribute('inert')).toBe(true)

    fireEvent.click(
      container.querySelector('[aria-label="Fill screen"]') as HTMLElement,
    )

    expect(onToggleVideoFitMode).toHaveBeenCalledTimes(1)
  })

  it('wires section, video interaction, keyboard, and media events', () => {
    const props = createProps()
    const { container } = render(<PlayerSurface {...props} />)

    const section = container.querySelector('section')
    const videoButton = screen.getByRole('button', {
      name: 'player.videoPlayer',
    })
    const video = container.querySelector('video')
    if (!section || !video) throw new Error('Expected rendered player surface')

    fireEvent.mouseMove(section)
    fireEvent.mouseLeave(section)
    fireEvent.click(videoButton)
    fireEvent.touchEnd(videoButton)
    fireEvent.keyDown(videoButton, { key: 'Enter' })
    fireEvent(video, new Event('timeupdate'))
    fireEvent(video, new Event('durationchange'))
    fireEvent(video, new Event('progress'))
    fireEvent(video, new Event('play'))
    fireEvent(video, new Event('pause'))

    expect(props.fullscreen.onMouseMove).toHaveBeenCalledTimes(1)
    expect(props.fullscreen.onMouseLeave).toHaveBeenCalledTimes(1)
    expect(props.video.onInteraction).toHaveBeenCalledTimes(2)
    expect(props.video.onKeyDown).toHaveBeenCalledTimes(1)
    expect(props.video.onTimeUpdate).toHaveBeenCalledTimes(1)
    expect(props.video.onDurationChange).toHaveBeenCalledTimes(1)
    expect(props.video.onProgress).toHaveBeenCalledTimes(1)
    expect(props.video.onPlay).toHaveBeenCalledTimes(1)
    expect(props.video.onPause).toHaveBeenCalledTimes(1)
  })

  it('rounds the windowed surface and layers the blurred poster backdrop', () => {
    const { container } = render(
      <PlayerSurface
        {...createProps({
          video: { posterUrl: '/poster.jpg' },
        })}
      />,
    )

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
    expect(backdropClip.classList.contains('overflow-hidden')).toBe(true)
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
    const { container } = render(
      <PlayerSurface
        {...createProps({
          video: { posterUrl: '/poster.jpg' },
        })}
      />,
    )

    const video = container.querySelector('video')
    if (!video) throw new Error('Expected video element')

    for (let node = video.parentElement; node; node = node.parentElement) {
      expect(node.getAttribute('class') ?? '').not.toMatch(overflowClipClass)
    }
  })

  it('drops the rounded frame and poster backdrop in fullscreen', () => {
    const { container } = render(
      <PlayerSurface
        {...createProps({
          video: { posterUrl: '/poster.jpg' },
          fullscreen: { isFullscreen: true },
        })}
      />,
    )

    const videoButton = screen.getByRole('button', {
      name: 'player.videoPlayer',
    })
    expect(videoButton.classList.contains('rounded-2xl')).toBe(false)
    expect(videoButton.classList.contains('overflow-hidden')).toBe(false)

    expect(container.querySelector('img')).toBe(null)
  })

  it('rounds the error overlay only in windowed mode', () => {
    const error = {
      type: 'media_error',
      message: 'Playback failed',
      recoverable: false,
    } as const

    const { rerender } = render(
      <PlayerSurface {...createProps({ playback: { error } })} />,
    )

    const windowedOverlay = screen.getByText('Playback failed').parentElement
    if (!windowedOverlay) throw new Error('Expected error overlay')
    expect(windowedOverlay.classList.contains('rounded-2xl')).toBe(true)

    rerender(
      <PlayerSurface
        {...createProps({
          playback: { error },
          fullscreen: { isFullscreen: true },
        })}
      />,
    )

    const fullscreenOverlay = screen.getByText('Playback failed').parentElement
    if (!fullscreenOverlay) throw new Error('Expected error overlay')
    expect(fullscreenOverlay.classList.contains('rounded-2xl')).toBe(false)
  })

  it('rounds the loading overlay only in windowed mode', () => {
    const { container, rerender } = render(
      <PlayerSurface
        {...createProps({ playback: { isVideoLoading: true } })}
      />,
    )

    const windowedOverlay = container.querySelector('output')
    if (!windowedOverlay) throw new Error('Expected loading overlay')
    expect(windowedOverlay.classList.contains('rounded-2xl')).toBe(true)

    rerender(
      <PlayerSurface
        {...createProps({
          playback: { isVideoLoading: true },
          fullscreen: { isFullscreen: true },
        })}
      />,
    )

    const fullscreenOverlay = container.querySelector('output')
    if (!fullscreenOverlay) throw new Error('Expected loading overlay')
    expect(fullscreenOverlay.classList.contains('rounded-2xl')).toBe(false)
  })

  it('renders recoverable direct-play errors without the skip action', () => {
    const onRetry = vi.fn()
    render(
      <PlayerSurface
        {...createProps({
          playback: {
            onRetry,
            error: {
              type: 'media_error',
              message: 'Playback failed',
              recoverable: true,
            },
          },
          segmentSkip: null,
        })}
      />,
    )

    expect(screen.getByText('Playback failed')).toBeTruthy()
    expect(screen.getByText('player.error.directPlayFailed')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Skip type:Intro' })).toBe(null)

    fireEvent.click(screen.getByRole('button', { name: 'player.retry' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
