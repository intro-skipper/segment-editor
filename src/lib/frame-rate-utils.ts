import { parseFrameRate } from './time-utils'
import type { BaseItemDto } from '@/types/jellyfin'

type FrameRateField = 'RealFrameRate' | 'AverageFrameRate' | 'FrameRate'

const FRAME_RATE_FIELDS: ReadonlyArray<FrameRateField> = [
  'RealFrameRate',
  'AverageFrameRate',
  'FrameRate',
]

function readNumericLikeField(
  source: unknown,
  field: FrameRateField,
): string | number | undefined {
  if (!source || typeof source !== 'object') return undefined
  const value = (source as Record<string, unknown>)[field]
  if (typeof value === 'string' || typeof value === 'number') {
    return value
  }
  return undefined
}

function isVideoStream(stream: unknown): boolean {
  if (!stream || typeof stream !== 'object') return false
  return (stream as Record<string, unknown>).Type === 'Video'
}

export function getFrameStepSeconds(item: BaseItemDto): number | undefined {
  const mediaStreams = item.MediaSources?.[0]?.MediaStreams
  if (!Array.isArray(mediaStreams) || mediaStreams.length === 0) {
    return undefined
  }

  const videoStream = mediaStreams.find(isVideoStream)
  if (!videoStream) return undefined

  for (const field of FRAME_RATE_FIELDS) {
    const fps = parseFrameRate(readNumericLikeField(videoStream, field))
    if (fps !== null) {
      return 1 / fps
    }
  }

  return undefined
}
