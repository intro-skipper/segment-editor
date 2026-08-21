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
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { asElement } from './helpers/dom'
import { lookup } from '@/lib/utils'
import { resolveTranslation } from './helpers/i18n-mock'
import type { TranslationArg } from './helpers/i18n-mock'

import type { MediaSegmentDto } from '@/types/jellyfin'
import { SegmentSlider } from '@/components/segment/SegmentSlider'

const translations = {
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
    t: (key: string, fallback?: TranslationArg) =>
      lookup(translations, key) ?? resolveTranslation(key, fallback),
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

function renderSlider(
  segment: MediaSegmentDto = createSegment(),
  props: Partial<React.ComponentProps<typeof SegmentSlider>> = {},
) {
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
      {...props}
    />,
  )

  return { ...result, onUpdate }
}

describe('SegmentSlider type menu', () => {
  afterEach(() => {
    cleanup()
  })

  it('changes the segment type through the inline type menu', async () => {
    const onChangeType = vi.fn()
    renderSlider(createSegment(), { onChangeType })

    fireEvent.click(screen.getByRole('button', { name: 'Segment type' }))

    const outroItem = await screen.findByRole('menuitem', {
      name: /segmentType\.Outro/,
    })
    fireEvent.click(outroItem)

    await waitFor(() => {
      expect(onChangeType).toHaveBeenCalledWith(0, 'Outro')
    })
  })

  it('renders a static type label without onChangeType', () => {
    renderSlider()

    expect(screen.queryByRole('button', { name: 'Segment type' })).toBeNull()
    expect(screen.getByText('Intro')).toBeTruthy()
  })
})

describe('SegmentSlider TanStack Form migration', () => {
  afterEach(() => {
    cleanup()
  })

  it('defers commits from typed input until blur', async () => {
    const { onUpdate } = renderSlider()

    const startInput = asElement(
      document.getElementById('segment-segment-1-start'),
      HTMLInputElement,
    )
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

    const startInput = asElement(
      document.getElementById('segment-segment-1-start'),
      HTMLInputElement,
    )
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
    const sliderTrack = asElement(
      screen.getByRole('group', { name: /segment slider group/i }),
      HTMLFieldSetElement,
    )
    expect(sliderTrack.getAttribute('aria-describedby')).toBe(
      'segment-segment-1-description',
    )

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

    const endInput = asElement(
      document.getElementById('segment-segment-1-end'),
      HTMLInputElement,
    )
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

  it('exposes frame step precision on range handles', () => {
    renderSlider(createSegment(), { frameStepSeconds: 1001 / 24000 })

    const startHandle = screen.getByRole('slider', { name: /start handle/i })
    const endHandle = screen.getByRole('slider', { name: /end handle/i })

    expect(startHandle.getAttribute('step')).toBe(String(1001 / 24000))
    expect(endHandle.getAttribute('step')).toBe(String(1001 / 24000))
  })

  it('snaps keyboard handle changes to fractional frame steps', async () => {
    const frameStepSeconds = 1001 / 24000
    renderSlider(createSegment(), { frameStepSeconds })

    const startHandle = screen.getByRole('slider', { name: /start handle/i })
    fireEvent.keyDown(startHandle, { key: 'ArrowRight' })

    const startInput = asElement(
      document.getElementById('segment-segment-1-start'),
      HTMLInputElement,
    )
    await waitFor(() => {
      expect(startInput.value).toBe('10.093')
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
      />,
    )

    const startInput = asElement(
      document.getElementById('segment-segment-1-start'),
      HTMLInputElement,
    )
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
      />,
    )

    expect(startInput.value).toBe('12')
    expect(onUpdate).not.toHaveBeenCalled()
  })
})
