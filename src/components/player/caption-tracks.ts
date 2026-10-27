import type { BaseItemDto } from '@/types/jellyfin'
import { getPlaybackMediaSourceId, getSubtitleUrl } from '@/services/video/api'
import { extractTracks } from '@/services/video/tracks'

export interface NativeCaptionTrack {
  index: number
  language: string | undefined
  label: string
  src: string
}

/** One VTT <track> per subtitle stream of the item's media source, in stream order, for direct play and HLS alike. */
export function buildNativeCaptionTracks(
  item: BaseItemDto,
): Array<NativeCaptionTrack> {
  const mediaSourceId = getPlaybackMediaSourceId(item)
  if (!item.Id || !mediaSourceId) return []

  const tracks: Array<NativeCaptionTrack> = []
  for (const track of extractTracks(item).subtitleTracks) {
    const src = getSubtitleUrl(item.Id, mediaSourceId, track.index, 'vtt')
    if (src === '') continue

    tracks.push({
      index: track.index,
      language: track.language ?? undefined,
      label: track.displayTitle,
      src,
    })
  }

  return tracks
}
