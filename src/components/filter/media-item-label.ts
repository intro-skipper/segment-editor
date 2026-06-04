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
