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
  appearance: {
    colorMode: 'default',
    vibrantColors: null,
    iconColor: undefined,
    getButtonStyle: vi.fn(),
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
  refs?: Partial<SurfaceProps['refs']>
  fullscreen?: Partial<SurfaceProps['fullscreen']>
  video?: Partial<SurfaceProps['video']>
  playback?: Partial<SurfaceProps['playback']>
  segmentSkip?: Partial<SurfaceProps['segmentSkip']>
  controls?: Partial<SurfaceProps['controls']>
}

function createProps(overrides: SurfacePropOverrides = {}): SurfaceProps {
  return {
    className: overrides.className,
    refs: {
      container: createRef<HTMLDivElement>(),
      video: createRef<HTMLVideoElement>(),
      ...overrides.refs,
    },
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
      primaryCaptionTrack: {
        index: 1,
        language: 'eng',
        label: 'English',
        src: '/caption-1.vtt',
      },
      additionalCaptionTracks: [
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
    segmentSkip: {
      mode: 'button',
      activeSegment: skipSegment,
      onSkipSegment: vi.fn(),
      ...overrides.segmentSkip,
    },
    controls: {
      props: playerControlsProps,
      fullscreenTimelineScrubber: <div data-testid="fullscreen-scrubber" />,
      inlineTimelineScrubber: <div data-testid="inline-scrubber" />,
      ...overrides.controls,
    },
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
    expect(screen.getByTestId('inline-scrubber')).toBeTruthy()
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

    expect(screen.getByTestId('fullscreen-scrubber')).toBeTruthy()
    expect(screen.queryByTestId('inline-scrubber')).toBe(null)

    const overlay = screen
      .getByTestId('fullscreen-scrubber')
      .closest('[aria-hidden]')
    expect(overlay?.getAttribute('aria-hidden')).toBe('true')
    expect(overlay?.hasAttribute('inert')).toBe(true)

    fireEvent.click(
      container.querySelector('[aria-label="Fill screen"]') as HTMLElement,
    )

    expect(onToggleVideoFitMode).toHaveBeenCalledTimes(1)
    expect(container.querySelector('section')?.className).toContain('fixed')
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

  it('renders recoverable direct-play errors and suppresses skip while errored', () => {
    const onRetry = vi.fn()
    const onSkipSegment = vi.fn()
    render(
      <PlayerSurface
        {...createProps({
          playback: {
            onRetry,
            error: {
              type: 'media',
              message: 'Playback failed',
              recoverable: true,
            },
          },
          segmentSkip: { onSkipSegment },
        })}
      />,
    )

    expect(screen.getByText('Playback failed')).toBeTruthy()
    expect(screen.getByText('player.error.directPlayFailed')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Skip type:Intro' })).toBe(null)

    fireEvent.click(screen.getByRole('button', { name: 'player.retry' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onSkipSegment).not.toHaveBeenCalled()
  })
})
