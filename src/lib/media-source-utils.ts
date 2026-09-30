import type { BaseItemDto } from '@/types/jellyfin'

/** A media version exposed by Jellyfin for a video item. */
export type MediaSource = NonNullable<
  NonNullable<BaseItemDto['MediaSources']>[number]
>

export type SelectableMediaSource = MediaSource & { Id: string }

function hasMediaSourceId(
  source: MediaSource,
): source is SelectableMediaSource {
  return typeof source.Id === 'string' && source.Id.trim().length > 0
}

/**
 * Returns media sources that can be explicitly selected by a client.
 * Jellyfin normally supplies an ID for every version, but filtering malformed
 * entries here keeps the selector from producing an unusable option.
 */
export function getSelectableMediaSources(
  item: Pick<BaseItemDto, 'MediaSources'> | null | undefined,
): SelectableMediaSource[] {
  const sources = item?.MediaSources ?? []
  const seenIds = new Set<string>()

  return sources.filter((source): source is SelectableMediaSource => {
    if (!hasMediaSourceId(source)) return false

    const normalizedId = source.Id.toLowerCase()
    if (seenIds.has(normalizedId)) return false
    seenIds.add(normalizedId)
    return true
  })
}

function getFileName(path: string): string {
  const fileName = path.split(/[\\/]/).at(-1)?.trim()
  return fileName || path
}

/** Returns the most useful human-readable label for a Jellyfin version. */
export function getMediaSourceLabel(
  source: Pick<MediaSource, 'Name' | 'Path'>,
  index: number,
): string {
  const name = source.Name?.trim()
  if (name) return name

  const path = source.Path?.trim()
  if (path) return getFileName(path)

  return `Version ${index + 1}`
}

function sameMediaSourceId(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  return (
    typeof left === 'string' &&
    typeof right === 'string' &&
    left.toLowerCase() === right.toLowerCase()
  )
}

/** Finds a selected version, falling back to Jellyfin's default first source. */
export function findMediaSource(
  item: Pick<BaseItemDto, 'MediaSources'>,
  mediaSourceId?: string | null,
): SelectableMediaSource | undefined {
  const sources = getSelectableMediaSources(item)
  return (
    sources.find((source) => sameMediaSourceId(source.Id, mediaSourceId)) ??
    sources[0]
  )
}

/**
 * Narrows an item to one selected version while preserving its Jellyfin item
 * ID. Segments belong to the item, not to the media source, so callers should
 * use this only for playback and media metadata—not for segment API keys.
 */
export function itemForMediaSource(
  item: BaseItemDto,
  mediaSourceId?: string | null,
): BaseItemDto {
  const source = findMediaSource(item, mediaSourceId)
  if (!source) return item

  return {
    ...item,
    MediaSources: [source],
    MediaSourceCount: 1,
    MediaStreams: source.MediaStreams ?? item.MediaStreams,
    RunTimeTicks: source.RunTimeTicks ?? item.RunTimeTicks,
  }
}
