/**
 * @vitest-environment jsdom
 */

import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BaseItemDto } from '@/types/jellyfin'
import { SeriesView } from '@/components/views/SeriesView'

const navigateMock = vi.hoisted(() => vi.fn())
const observerRefMock = vi.hoisted(() => vi.fn())
const segmentTimelineMock = vi.hoisted(() => vi.fn(() => null))
const segmentsOptionsMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/services/items/queries', () => ({
  useEpisodes: () => ({
    data: [
      {
        Id: 'episode-1',
        Name: 'Episode 1',
        ParentIndexNumber: 1,
        IndexNumber: 1,
        RunTimeTicks: 600_000_000,
      },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

vi.mock('@/services/segments/queries', () => ({
  useSegments: (itemId: string, options: { enabled?: boolean }) => {
    segmentsOptionsMock(itemId, options)
    return { data: undefined, isPending: false, isError: true }
  },
}))

vi.mock('@/hooks/use-in-view', () => ({
  useInView: () => ({ ref: observerRefMock, inView: false }),
}))

vi.mock('@/components/media/ItemImage', () => ({
  ItemImage: () => null,
}))

vi.mock('@/components/segment/SegmentTimeline', () => ({
  SegmentTimeline: segmentTimelineMock,
}))

vi.mock('@/components/ui/interactive-card', () => ({
  InteractiveCard: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}))

const series: BaseItemDto = { Id: 'series-1', Name: 'Series' }
const season: BaseItemDto = {
  Id: 'season-1',
  Name: 'Season 1',
  IndexNumber: 1,
}

describe('SeriesView', () => {
  afterEach(() => {
    cleanup()
    navigateMock.mockReset()
    observerRefMock.mockReset()
    segmentTimelineMock.mockClear()
    segmentsOptionsMock.mockReset()
  })

  it('keeps the lazy observer target mounted for a cached segment error', () => {
    render(
      <SeriesView
        series={series}
        seasons={[season]}
        selectedSeasonId="season-1"
        onSeasonSelect={vi.fn()}
      />,
    )

    expect(segmentsOptionsMock).toHaveBeenCalledWith('episode-1', {
      enabled: false,
    })
    expect(observerRefMock).toHaveBeenCalledWith(expect.any(HTMLDivElement))
    expect(segmentTimelineMock).not.toHaveBeenCalled()
  })
})
