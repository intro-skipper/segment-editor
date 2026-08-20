import { z } from 'zod'

import { parseFrameRate } from './time-utils'
import { DEFAULT_FRAME_STEP } from './constants'
import type { BaseItemDto } from '@/types/jellyfin'

type FrameRateField = 'RealFrameRate' | 'AverageFrameRate' | 'FrameRate'

const FRAME_RATE_FIELDS: ReadonlyArray<FrameRateField> = [
  'RealFrameRate',
  'AverageFrameRate',
  'FrameRate',
]

/** A frame rate as servers report it: a number, or a rational string. */
const FrameRateValueSchema = z
  .union([z.string(), z.number()])
  .optional()
  .catch(undefined)

/**
 * The frame-rate fields this module reads. `FrameRate` is absent from the SDK's
 * generated MediaStream but is emitted by some server versions, so the chosen
 * stream is decoded here rather than read through the generated type.
 */
const FrameRateStreamSchema = z.object({
  RealFrameRate: FrameRateValueSchema,
  AverageFrameRate: FrameRateValueSchema,
  FrameRate: FrameRateValueSchema,
})

/**
 * Runs on the editor's render path, so the streams are filtered by the typed
 * `Type` field first and only the one match is decoded.
 */
function getFrameStepSeconds(item: BaseItemDto): number | undefined {
  // `MediaStreams` is server-supplied, so its array-ness is checked rather
  // than trusted — the same reason the chosen stream is decoded below.
  const mediaStreams = item.MediaSources?.[0]?.MediaStreams
  if (!Array.isArray(mediaStreams)) return undefined

  // Only the first video stream carries the item's frame rate.
  const videoStream = mediaStreams.find((stream) => stream.Type === 'Video')
  if (!videoStream) return undefined

  const decoded = FrameRateStreamSchema.safeParse(videoStream)
  if (!decoded.success) return undefined

  for (const field of FRAME_RATE_FIELDS) {
    const fps = parseFrameRate(decoded.data[field])
    if (fps !== null) {
      return 1 / fps
    }
  }

  return undefined
}

export function resolveFrameStepSeconds(item: BaseItemDto): number {
  return getFrameStepSeconds(item) ?? DEFAULT_FRAME_STEP
}
