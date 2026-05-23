/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PlayerScrubber } from '@/components/player/PlayerScrubber'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { changeLanguage: vi.fn(), language: 'en-US' },
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

describe('PlayerScrubber', () => {
  afterEach(() => {
    cleanup()
  })

  it('keeps the hidden range value within finite bounds', () => {
    render(
      <PlayerScrubber
        currentTime={66.2}
        duration={65}
        buffered={90}
        vibrantColors={null}
        onSeek={vi.fn()}
      />,
    )

    const range = screen.getByRole('slider', {
      name: 'Video progress',
    }) as HTMLInputElement

    expect(range.min).toBe('0')
    expect(range.max).toBe('65')
    expect(range.value).toBe('65')
    expect(range.getAttribute('aria-valuetext')).toBe('01:05.000 of 01:05.000')

    const track = range.nextElementSibling as HTMLDivElement | null
    if (!track) throw new Error('Expected scrubber track after range input')
    const bufferedBar = track.firstElementChild as HTMLElement | null
    const progressBar = track.lastElementChild as HTMLElement | null

    expect(bufferedBar?.style.width).toBe('100%')
    expect(progressBar?.style.width).toBe('100%')
  })

  it('falls back to zero bounds for non-finite media times', () => {
    render(
      <PlayerScrubber
        currentTime={Number.NaN}
        duration={Number.POSITIVE_INFINITY}
        vibrantColors={null}
        onSeek={vi.fn()}
      />,
    )

    const range = screen.getByRole('slider', {
      name: 'Video progress',
    }) as HTMLInputElement

    expect(range.max).toBe('0')
    expect(range.value).toBe('0')
    expect(range.getAttribute('aria-valuetext')).toBe('00:00.000 of 00:00.000')
  })

  it('does not seek from keyboard input when media bounds are non-finite', () => {
    const onSeek = vi.fn()

    render(
      <PlayerScrubber
        currentTime={Number.NaN}
        duration={Number.POSITIVE_INFINITY}
        vibrantColors={null}
        onSeek={onSeek}
      />,
    )

    const range = screen.getByRole('slider', {
      name: 'Video progress',
    })

    fireEvent.keyDown(range, { key: 'ArrowRight' })

    expect(onSeek).not.toHaveBeenCalled()
  })
})
