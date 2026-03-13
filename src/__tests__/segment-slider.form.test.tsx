/**
 * @vitest-environment jsdom
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'

import type { MediaSegmentDto } from '@/types/jellyfin'
import { SegmentSlider } from '@/components/segment/SegmentSlider'

const translations: Record<string, string> = {
  'accessibility.copySegment': 'Copy segment',
  'accessibility.deleteSegment': 'Delete segment',
  'accessibility.seekToEnd': 'Seek to end',
  'accessibility.seekToStart': 'Seek to start',
  'editor.copy': 'Copy',
  'editor.copyAll': 'Copy all',
  'editor.setEndTime': 'Set end from player',
  'editor.setStartTime': 'Set start from player',
  'segment.edit': 'Edit segment',
  'segment.end': 'End',
  'segment.endHandle': 'End handle',
  'segment.sliderDescription': 'Segment slider description',
  'segment.sliderGroup': 'Segment slider group',
  'segment.start': 'Start',
  'segment.startHandle': 'Start handle',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { changeLanguage: vi.fn(), language: 'en-US' },
    t: (key: string, fallback?: string) =>
      translations[key] ?? (typeof fallback === 'string' ? fallback : key),
  }),
}))

beforeAll(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 0),
  )

  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  })

  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
    configurable: true,
    value: vi.fn(),
  })

  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
    configurable: true,
    value: vi.fn(() => true),
  })
})

function createSegment(
  overrides: Partial<MediaSegmentDto> = {},
): MediaSegmentDto {
  return {
    EndTicks: 20,
    Id: 'segment-1',
    StartTicks: 10,
    Type: 'Intro',
    ...overrides,
  }
}

function renderSlider(segment: MediaSegmentDto = createSegment()) {
  const onUpdate = vi.fn()

  const result = render(
    <SegmentSlider
      segment={segment}
      index={0}
      isActive
      runtimeSeconds={100}
      onCopyAllAsJson={vi.fn()}
      onDelete={vi.fn()}
      onEdit={vi.fn()}
      onPlayerTimestamp={vi.fn()}
      onSetActive={vi.fn()}
      onUpdate={onUpdate}
      vibrantColors={null}
    />,
  )

  return { ...result, onUpdate }
}

describe('SegmentSlider TanStack Form migration', () => {
  afterEach(() => {
    cleanup()
  })

  it('defers commits from typed input until blur', async () => {
    const { onUpdate } = renderSlider()

    const startInput = document.getElementById(
      'segment-segment-1-start',
    ) as HTMLInputElement
    fireEvent.change(startInput, { target: { value: '12' } })

    expect(onUpdate).not.toHaveBeenCalled()

    fireEvent.blur(startInput)

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledTimes(1)
    })
    expect(onUpdate).toHaveBeenCalledWith({
      end: 20,
      id: 'segment-1',
      start: 12,
    })
  })

  it('reverts invalid typed input to the last valid value on blur without committing', async () => {
    const { onUpdate } = renderSlider()

    const startInput = document.getElementById(
      'segment-segment-1-start',
    ) as HTMLInputElement
    fireEvent.change(startInput, { target: { value: '25' } })

    await screen.findByText('Start time must be less than end time')
    fireEvent.blur(startInput)

    // Blur restores the last committed valid value (original start = 10)
    expect(startInput.value).toBe('10')
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('commits exactly once on drag end', async () => {
    const { onUpdate } = renderSlider()

    const endHandle = screen.getAllByRole('slider', { name: /end handle/i })[0]
    const sliderTrack = endHandle.parentElement?.parentElement as HTMLDivElement

    Object.defineProperty(sliderTrack, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: 20,
        height: 20,
        left: 0,
        right: 100,
        toJSON: () => ({}),
        top: 0,
        width: 100,
        x: 0,
        y: 0,
      }),
    })

    fireEvent.pointerDown(endHandle, { clientX: 20, pointerId: 1 })
    fireEvent.pointerMove(sliderTrack, { clientX: 35, pointerId: 1 })

    const endInput = document.getElementById(
      'segment-segment-1-end',
    ) as HTMLInputElement
    await waitFor(() => {
      expect(endInput.value).toBe('35')
    })

    expect(onUpdate).not.toHaveBeenCalled()

    fireEvent.pointerUp(sliderTrack, { clientX: 35, pointerId: 1 })

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledTimes(1)
    })
    expect(onUpdate).toHaveBeenCalledWith({
      end: 35,
      id: 'segment-1',
      start: 10,
    })
  })

  it('does not overwrite an active draft when the segment prop refreshes', () => {
    const onUpdate = vi.fn()

    const { rerender } = render(
      <SegmentSlider
        segment={createSegment()}
        index={0}
        isActive
        runtimeSeconds={100}
        onCopyAllAsJson={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onPlayerTimestamp={vi.fn()}
        onSetActive={vi.fn()}
        onUpdate={onUpdate}
        vibrantColors={null}
      />,
    )

    const startInput = document.getElementById(
      'segment-segment-1-start',
    ) as HTMLInputElement
    fireEvent.focus(startInput)
    fireEvent.change(startInput, { target: { value: '12' } })

    rerender(
      <SegmentSlider
        segment={createSegment({ EndTicks: 40, StartTicks: 30 })}
        index={0}
        isActive
        runtimeSeconds={100}
        onCopyAllAsJson={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onPlayerTimestamp={vi.fn()}
        onSetActive={vi.fn()}
        onUpdate={onUpdate}
        vibrantColors={null}
      />,
    )

    expect(startInput.value).toBe('12')
    expect(onUpdate).not.toHaveBeenCalled()
  })
})
