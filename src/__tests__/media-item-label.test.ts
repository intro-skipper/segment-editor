import { describe, expect, it, vi } from 'vitest'
import type { TFunction } from 'i18next'

import type { BaseItemDto } from '@/types/jellyfin'
import { BaseItemKind } from '@/types/jellyfin'
import { getMediaItemLabel } from '@/components/filter/media-item-label'

describe('getMediaItemLabel', () => {
  it('uses item-specific accessibility keys with name and year', () => {
    const t = vi.fn(
      (key: string, options: { name: string }) => `${key}:${options.name}`,
    )

    const label = getMediaItemLabel(
      t as unknown as TFunction,
      {
        Name: 'Blade Runner',
        ProductionYear: 1982,
        Type: BaseItemKind.Movie,
      } as BaseItemDto,
    )

    expect(label).toBe('accessibility.mediaCard.playMovie:Blade Runner (1982)')
    expect(t).toHaveBeenCalledWith('accessibility.mediaCard.playMovie', {
      name: 'Blade Runner (1982)',
    })
  })

  it('falls back for unknown item types and missing names', () => {
    const t = vi.fn(
      (key: string, options: { name: string }) => `${key}:${options.name}`,
    )

    const label = getMediaItemLabel(
      t as unknown as TFunction,
      { Type: 'UnknownType' } as unknown as BaseItemDto,
    )

    expect(label).toBe('accessibility.mediaCard.play:Unknown')
    expect(t).toHaveBeenCalledWith('accessibility.mediaCard.play', {
      name: 'Unknown',
    })
  })
})
