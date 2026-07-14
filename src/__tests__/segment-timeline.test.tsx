/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MediaSegmentDto } from '@/types/jellyfin'
import { MediaSegmentType } from '@/types/jellyfin'
import {
  SegmentTimeline,
  formatTimelineTime,
} from '@/components/segment/SegmentTimeline'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { changeLanguage: vi.fn(), language: 'en-US' },
    t: (_key: string, fallbackOrOptions?: string | Record<string, unknown>) => {
      if (typeof fallbackOrOptions === 'string') return fallbackOrOptions
      if (fallbackOrOptions && typeof fallbackOrOptions === 'object') {
        const { defaultValue, ...params } = fallbackOrOptions
        let text = typeof defaultValue === 'string' ? defaultValue : _key
        for (const [name, value] of Object.entries(params)) {
          text = text.replace(`{{${name}}}`, String(value))
        }
        return text
      }
      return _key
    },
  }),
}))

// StartTicks/EndTicks are in SECONDS at the UI boundary (see segments/api.ts)
const segment = (
  start: number,
  end: number,
  type: MediaSegmentType = MediaSegmentType.Intro,
  id = `seg-${type}-${start}`,
): MediaSegmentDto => ({
  Id: id,
  ItemId: 'item-1',
  Type: type,
  StartTicks: start,
  EndTicks: end,
})

describe('formatTimelineTime', () => {
  it('formats minutes and hours without milliseconds', () => {
    expect(formatTimelineTime(0)).toBe('0:00')
    expect(formatTimelineTime(24.9)).toBe('0:24')
    expect(formatTimelineTime(114)).toBe('1:54')
    expect(formatTimelineTime(3665)).toBe('1:01:05')
  })

  it('falls back to 0:00 for invalid values', () => {
    expect(formatTimelineTime(Number.NaN)).toBe('0:00')
    expect(formatTimelineTime(-5)).toBe('0:00')
  })
})

describe('SegmentTimeline', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders colored regions positioned by runtime percentage', () => {
    render(
      <SegmentTimeline
        segments={[
          segment(0, 90, MediaSegmentType.Intro),
          segment(1200, 1440, MediaSegmentType.Outro),
        ]}
        runtimeSeconds={1440}
      />,
    )

    const timeline = screen.getByTestId('segment-timeline')
    expect(timeline.getAttribute('aria-label')).toBe(
      'Segments: Intro 0:00 – 1:30, Outro 20:00 – 24:00',
    )

    const regions = Array.from(timeline.children) as Array<HTMLElement>
    expect(regions).toHaveLength(2)

    expect(regions[0].style.left).toBe('0%')
    expect(regions[0].style.width).toBe('6.25%')
    expect(regions[0].style.backgroundColor).toBe('var(--segment-intro)')
    expect(regions[0].title).toBe('Intro 0:00 – 1:30')

    expect(regions[1].style.left).toBe(`${(1200 / 1440) * 100}%`)
    expect(regions[1].style.backgroundColor).toBe('var(--segment-outro)')
  })

  it('keeps very short segments visible', () => {
    render(
      <SegmentTimeline segments={[segment(10, 11)]} runtimeSeconds={1440} />,
    )

    const timeline = screen.getByTestId('segment-timeline')
    const regions = Array.from(timeline.children) as Array<HTMLElement>
    expect(regions).toHaveLength(1)
    expect(regions[0].style.width).toBe('0.8%')
  })

  it('renders an empty labelled track when no segments exist', () => {
    render(<SegmentTimeline segments={[]} runtimeSeconds={1440} />)

    const timeline = screen.getByTestId('segment-timeline')
    expect(timeline.getAttribute('aria-label')).toBe('No segments')
    expect(timeline.children).toHaveLength(0)
  })

  it('renders a placeholder while loading', () => {
    render(<SegmentTimeline segments={[]} runtimeSeconds={1440} isLoading />)

    expect(screen.getByTestId('segment-timeline-loading')).toBeTruthy()
    expect(screen.queryByTestId('segment-timeline')).toBeNull()
  })

  it('scales against the furthest segment end when runtime is unknown', () => {
    render(
      <SegmentTimeline
        segments={[segment(0, 60), segment(540, 600, MediaSegmentType.Outro)]}
        runtimeSeconds={0}
      />,
    )

    const timeline = screen.getByTestId('segment-timeline')
    const regions = Array.from(timeline.children) as Array<HTMLElement>
    expect(regions).toHaveLength(2)
    expect(regions[0].style.width).toBe('10%')
    expect(regions[1].style.left).toBe('90%')
  })
})
