import { getSubtitleDeliveryUrl } from '@/services/video/track-switching'
import type { SubtitleTrackInfo } from '@/services/video/tracks'

export interface NativeCaptionTrack {
  index: number
  language: string | undefined
  label: string
  src: string
}

/** One VTT <track> per subtitle stream, in stream order, for direct play and HLS alike. */
export function buildNativeCaptionTracks(
  itemId: string | undefined,
  subtitleTracks: ReadonlyArray<SubtitleTrackInfo>,
): Array<NativeCaptionTrack> {
  if (!itemId || subtitleTracks.length === 0) return []

  const tracks: Array<NativeCaptionTrack> = []
  for (const track of subtitleTracks) {
    const src = getSubtitleDeliveryUrl(itemId, track.index, 'vtt')
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
