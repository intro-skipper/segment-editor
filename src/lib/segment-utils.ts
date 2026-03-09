import {
  DEFAULT_SEGMENT_COLOR,
  SEGMENT_COLORS,
  SEGMENT_TYPES,
} from './constants'
import type { MediaSegmentDto, MediaSegmentType } from '@/types/jellyfin'

export { SEGMENT_TYPES }
export const sortSegmentsByStart = (
  a: MediaSegmentDto,
  b: MediaSegmentDto,
): number => (a.StartTicks ?? 0) - (b.StartTicks ?? 0)

export const getSegmentColor = (type: MediaSegmentType | undefined): string =>
  (type && SEGMENT_COLORS[type].bg) ?? DEFAULT_SEGMENT_COLOR.bg

export const getSegmentCssVar = (type: MediaSegmentType | undefined): string =>
  (type && SEGMENT_COLORS[type].css) ?? DEFAULT_SEGMENT_COLOR.css

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const generateUUID = (): string => {
  // Use crypto.randomUUID if available (secure contexts), otherwise fallback
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }
  // Fallback for non-secure contexts (e.g., HTTP localhost)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export const isValidUUID = (uuid: string | null | undefined): boolean =>
  typeof uuid === 'string' && UUID_V4.test(uuid)
