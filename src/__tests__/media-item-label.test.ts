import { describe, expect, it, vi } from 'vitest'

import { BaseItemKind } from '@/types/jellyfin'
import {
  getMediaItemLabel,
  getSeriesCountLabel,
} from '@/components/filter/media-item-label'

describe('getMediaItemLabel', () => {
  it('uses item-specific accessibility keys with name and year', () => {
    const t = vi.fn(
      (key: string, options: { name: string }) => `${key}:${options.name}`,
    )

    const label = getMediaItemLabel(t, {
      Name: 'Blade Runner',
      ProductionYear: 1982,
      Type: BaseItemKind.Movie,
    })

    expect(label).toBe('accessibility.mediaCard.playMovie:Blade Runner (1982)')
    expect(t).toHaveBeenCalledWith('accessibility.mediaCard.playMovie', {
      name: 'Blade Runner (1982)',
    })
  })

  it('falls back for unknown item types and missing names', () => {
    const t = vi.fn(
      (key: string, options: { name: string }) => `${key}:${options.name}`,
    )

    // Folder is a real kind the label map does not cover, so it exercises
    // the same fallback as a type this client has never seen.
    const label = getMediaItemLabel(t, { Type: BaseItemKind.Folder })

    expect(label).toBe('accessibility.mediaCard.play:Unknown')
    expect(t).toHaveBeenCalledWith('accessibility.mediaCard.play', {
      name: 'Unknown',
    })
  })
})

describe('getSeriesCountLabel', () => {
  const t = (key: string, options: { count: number }) =>
    `${key}:${options.count}`

  it('shows the season count for multi-season series', () => {
    const label = getSeriesCountLabel(t, {
      Type: BaseItemKind.Series,
      ChildCount: 3,
      RecursiveItemCount: 36,
    })

    expect(label).toBe('items.seasonCount:3')
  })

  it('shows the episode count for single-season series', () => {
    const label = getSeriesCountLabel(t, {
      Type: BaseItemKind.Series,
      ChildCount: 1,
      RecursiveItemCount: 12,
    })

    expect(label).toBe('items.episodeCount:12')
  })

  it('falls back to the season count when episodes are unknown', () => {
    const label = getSeriesCountLabel(t, {
      Type: BaseItemKind.Series,
      ChildCount: 1,
    })

    expect(label).toBe('items.seasonCount:1')
  })

  it('returns null for non-series items and series without counts', () => {
    expect(
      getSeriesCountLabel(t, {
        Type: BaseItemKind.Movie,
        ChildCount: 2,
      }),
    ).toBeNull()
    expect(getSeriesCountLabel(t, { Type: BaseItemKind.Series })).toBeNull()
  })
})
