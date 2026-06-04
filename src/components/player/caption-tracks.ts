import type { PlaybackStrategy } from '@/services/video/api'
import { getSubtitleDeliveryUrl } from '@/services/video/track-switching'
import type { SubtitleTrackInfo } from '@/services/video/tracks'

export interface NativeCaptionTrack {
  index: number
  language: string | undefined
  label: string
  src: string
}

export function buildNativeCaptionTracks(
  strategy: PlaybackStrategy,
  itemId: string | undefined,
  subtitleTracks: readonly SubtitleTrackInfo[],
): Array<NativeCaptionTrack> {
  if (strategy !== 'direct' || !itemId || subtitleTracks.length === 0) return []

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
