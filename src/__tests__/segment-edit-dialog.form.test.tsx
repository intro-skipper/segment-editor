/**
 * @vitest-environment jsdom
 */

import * as React from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { MediaSegmentDto } from '@/types/jellyfin'
import { SegmentEditDialog } from '@/components/segment/SegmentEditDialog'

const clipboardWriteTextMock = vi.fn()

const translations: Record<string, string> = {
  close: 'Close',
  'editor.saveSegment': 'Save segment',
  'editor.slider.title': 'Segment details',
  'segment.duration': 'Duration',
  'segment.edit': 'Edit segment',
  'segment.end': 'End',
  'segment.start': 'Start',
  'segment.type': 'Type',
  no: 'No',
  yes: 'Yes',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { changeLanguage: vi.fn(), language: 'en-US' },
    t: (key: string, fallback?: string) =>
      translations[key] ?? (typeof fallback === 'string' ? fallback : key),
  }),
}))

vi.mock('@/services/plugins/intro-skipper', () => ({
  segmentsToIntroSkipperClipboardText: (segments: Array<MediaSegmentDto>) => ({
    text: JSON.stringify(segments),
  }),
}))

vi.mock('@/lib/notifications', () => ({
  showNotification: vi.fn(),
}))

function createSegment(
  overrides: Partial<MediaSegmentDto> = {},
): MediaSegmentDto {
  return {
    EndTicks: 25,
    Id: 'segment-1',
    StartTicks: 10,
    Type: 'Intro',
    ...overrides,
  }
}

function getInput(label: string): HTMLInputElement {
  const element = screen.getByLabelText(label)
  if (!(element instanceof HTMLInputElement)) {
    throw new TypeError(`Expected input for label: ${label}`)
  }
  return element
}

function SegmentEditDialogHarness() {
  const [open, setOpen] = React.useState(true)
  const [segment, setSegment] = React.useState(
    createSegment({ EndTicks: 25, StartTicks: 10 }),
  )
  const onSave = vi.fn()
  const onDelete = vi.fn()

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Reopen dialog
      </button>
      <button
        type="button"
        onClick={() =>
          setSegment(
            createSegment({ EndTicks: 40, Id: 'segment-2', StartTicks: 20 }),
          )
        }
      >
        Load second segment
      </button>
      <SegmentEditDialog
        open={open}
        segment={segment}
        onClose={() => setOpen(false)}
        onDelete={onDelete}
        onSave={onSave}
      />
    </>
  )
}

describe('SegmentEditDialog TanStack Form migration', () => {
  beforeEach(() => {
    clipboardWriteTextMock.mockReset()
    clipboardWriteTextMock.mockResolvedValue(undefined)
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteTextMock },
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('rejects invalid ranges and prevents save', async () => {
    const onSave = vi.fn()

    render(
      <SegmentEditDialog
        open
        segment={createSegment()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onSave={onSave}
      />,
    )

    fireEvent.change(screen.getByLabelText('Start'), {
      target: { value: '20' },
    })
    fireEvent.change(screen.getByLabelText('End'), {
      target: { value: '5' },
    })

    await screen.findByText('Start time must be less than end time')

    const saveButton = screen.getByRole('button', { name: 'Save segment' })
    expect((saveButton as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(saveButton)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('saves valid time-string drafts as parsed segment values', async () => {
    const onSave = vi.fn()

    render(
      <SegmentEditDialog
        open
        segment={createSegment()}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onSave={onSave}
      />,
    )

    fireEvent.change(screen.getByLabelText('Start'), {
      target: { value: '1:02.5' },
    })
    fireEvent.change(screen.getByLabelText('End'), {
      target: { value: '2:03.75' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save segment' }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          EndTicks: 123.75,
          StartTicks: 62.5,
          Type: 'Intro',
        }),
      )
    })
  })

  it('resets to the new segment values when reopening after prop changes', async () => {
    render(<SegmentEditDialogHarness />)

    const startInput = screen.getByLabelText('Start')
    fireEvent.change(startInput, { target: { value: '12' } })
    expect((startInput as HTMLInputElement).value).toBe('12')

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    fireEvent.click(screen.getByRole('button', { name: 'Load second segment' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reopen dialog' }))

    await waitFor(() => {
      expect(getInput('Start').value).toBe('20')
      expect(getInput('End').value).toBe('40')
    })
  })

  it('keeps copy and delete scoped to the persisted segment until save', async () => {
    const onDelete = vi.fn()
    const segment = createSegment()

    render(
      <SegmentEditDialog
        open
        segment={segment}
        onClose={vi.fn()}
        onDelete={onDelete}
        onSave={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Start'), {
      target: { value: '12' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

    await waitFor(() => {
      expect(clipboardWriteTextMock).toHaveBeenCalledTimes(1)
    })

    const copiedSegments = JSON.parse(
      clipboardWriteTextMock.mock.calls[0]?.[0] as string,
    ) as Array<MediaSegmentDto>
    expect(copiedSegments[0]?.StartTicks).toBe(segment.StartTicks)

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))

    expect(onDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        Id: segment.Id,
        StartTicks: segment.StartTicks,
      }),
    )
  })
})
