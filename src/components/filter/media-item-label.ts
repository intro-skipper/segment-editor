import type { TFunction } from 'i18next'
import type { BaseItemDto } from '@/types/jellyfin'
import { BaseItemKind } from '@/types/jellyfin'

const MEDIA_ITEM_LABEL_KEY_MAP: Record<string, string> = {
  [BaseItemKind.Series]: 'accessibility.mediaCard.viewSeries',
  [BaseItemKind.MusicArtist]: 'accessibility.mediaCard.viewArtist',
  [BaseItemKind.MusicAlbum]: 'accessibility.mediaCard.viewAlbum',
  [BaseItemKind.Movie]: 'accessibility.mediaCard.playMovie',
  [BaseItemKind.Episode]: 'accessibility.mediaCard.playEpisode',
}

export function getMediaItemLabel(t: TFunction, item: BaseItemDto): string {
  const name = item.Name ?? 'Unknown'
  const year = item.ProductionYear ? ` (${item.ProductionYear})` : ''
  const labelKey =
    MEDIA_ITEM_LABEL_KEY_MAP[item.Type ?? ''] ?? 'accessibility.mediaCard.play'

  return t(labelKey, { name: `${name}${year}` })
}

/**
 * Season/episode count shown next to the year on series cards.
 * Multi-season series show seasons; single-season series show the episode
 * count, which is the more useful number. Returns null for non-series items
 * or when the server did not provide counts.
 */
export function getSeriesCountLabel(
  t: TFunction,
  item: BaseItemDto,
): string | null {
  if (item.Type !== BaseItemKind.Series) return null

  const seasons = item.ChildCount ?? 0
  const episodes = item.RecursiveItemCount ?? 0

  if (seasons > 1) return t('items.seasonCount', { count: seasons })
  if (episodes > 0) return t('items.episodeCount', { count: episodes })
  if (seasons === 1) return t('items.seasonCount', { count: seasons })
  return null
}
