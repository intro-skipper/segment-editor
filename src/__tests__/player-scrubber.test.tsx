/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { asElement } from './helpers/dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { PlayerScrubber } from '@/components/player/PlayerScrubber'
import type { ChapterInfo } from '@/types/jellyfin'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { changeLanguage: vi.fn(), language: 'en-US' },
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

const primaryPointer = { pointerId: 1, isPrimary: true }

/** A 100 second scrubber on a 100px track, so clientX equals seconds and percent. */
function renderScrubber({
  onSeek,
  chapters,
}: {
  onSeek: (time: number) => void
  chapters?: Array<ChapterInfo>
}) {
  render(
    <PlayerScrubber
      currentTime={10}
      duration={100}
      chapters={chapters}
      onSeek={onSeek}
    />,
  )

  const range = screen.getByRole('slider', { name: 'Video progress' })
  const scrubber = asElement(range.parentElement, HTMLDivElement)
  Object.defineProperty(scrubber, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: 0,
      top: 0,
      right: 100,
      bottom: 8,
      width: 100,
      height: 8,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  })

  const track = asElement(range.nextElementSibling, HTMLDivElement)
  const progressBar = asElement(track.lastElementChild, HTMLElement)
  return { scrubber, progressBar }
}

describe('PlayerScrubber', () => {
  beforeAll(() => {
    // jsdom has no pointer capture.
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps the hidden range value within finite bounds', () => {
    render(
      <PlayerScrubber
        currentTime={66.2}
        duration={65}
        buffered={90}
        onSeek={vi.fn()}
      />,
    )

    const range = asElement(
      screen.getByRole('slider', { name: 'Video progress' }),
      HTMLInputElement,
    )

    expect(range.min).toBe('0')
    expect(range.max).toBe('65')
    expect(range.value).toBe('65')
    expect(range.getAttribute('aria-valuetext')).toBe('01:05.000 of 01:05.000')

    const track = asElement(range.nextElementSibling, HTMLDivElement)
    const bufferedBar = asElement(track.firstElementChild, HTMLElement)
    const progressBar = asElement(track.lastElementChild, HTMLElement)

    expect(bufferedBar.style.width).toBe('100%')
    expect(progressBar.style.width).toBe('100%')
  })

  it('falls back to zero bounds for non-finite media times', () => {
    render(
      <PlayerScrubber
        currentTime={Number.NaN}
        duration={Number.POSITIVE_INFINITY}
        onSeek={vi.fn()}
      />,
    )

    const range = asElement(
      screen.getByRole('slider', { name: 'Video progress' }),
      HTMLInputElement,
    )

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
        onSeek={onSeek}
      />,
    )

    const range = screen.getByRole('slider', {
      name: 'Video progress',
    })

    fireEvent.keyDown(range, { key: 'ArrowRight' })

    expect(onSeek).not.toHaveBeenCalled()
  })

  it('follows the pointer while dragging and seeks once when it ends', () => {
    const onSeek = vi.fn()
    const { scrubber, progressBar } = renderScrubber({ onSeek })

    fireEvent.pointerDown(scrubber, { ...primaryPointer, clientX: 20 })
    fireEvent.pointerMove(scrubber, { ...primaryPointer, clientX: 80 })

    expect(progressBar.style.width).toBe('80%')
    expect(onSeek).not.toHaveBeenCalled()

    fireEvent.pointerUp(scrubber, { ...primaryPointer, clientX: 80 })

    expect(onSeek).toHaveBeenCalledTimes(1)
    expect(onSeek).toHaveBeenCalledWith(80)
    expect(progressBar.style.width).toBe('10%')
  })

  it('commits the drag when the browser cancels the pointer', () => {
    const onSeek = vi.fn()
    const { scrubber } = renderScrubber({ onSeek })

    fireEvent.pointerDown(scrubber, { ...primaryPointer, clientX: 20 })
    fireEvent.pointerMove(scrubber, { ...primaryPointer, clientX: 60 })
    fireEvent.pointerCancel(scrubber, primaryPointer)

    expect(onSeek).toHaveBeenCalledTimes(1)
    expect(onSeek).toHaveBeenCalledWith(60)
  })

  it('ignores secondary buttons and secondary pointers', () => {
    const onSeek = vi.fn()
    const { scrubber } = renderScrubber({ onSeek })

    fireEvent.pointerDown(scrubber, {
      ...primaryPointer,
      clientX: 20,
      button: 2,
    })
    fireEvent.pointerUp(scrubber, { ...primaryPointer, clientX: 20, button: 2 })
    fireEvent.pointerDown(scrubber, {
      pointerId: 2,
      isPrimary: false,
      clientX: 20,
    })
    fireEvent.pointerUp(scrubber, {
      pointerId: 2,
      isPrimary: false,
      clientX: 20,
    })

    expect(onSeek).not.toHaveBeenCalled()
  })

  it('seeks exactly once when a chapter marker is clicked', () => {
    const onSeek = vi.fn()
    renderScrubber({
      onSeek,
      chapters: [{ Name: 'Intro', StartPositionTicks: 50 * 10_000_000 }],
    })

    const marker = screen.getByRole('button', { name: 'Intro' })
    fireEvent.pointerDown(marker, { ...primaryPointer, clientX: 51 })
    fireEvent.pointerUp(marker, { ...primaryPointer, clientX: 51 })
    fireEvent.click(marker)

    expect(onSeek).toHaveBeenCalledTimes(1)
    expect(onSeek).toHaveBeenCalledWith(50)
  })
})
