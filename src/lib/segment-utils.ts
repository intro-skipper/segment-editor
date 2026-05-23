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
  const cryptoApi = globalThis.crypto

  if (
    typeof cryptoApi !== 'undefined' &&
    typeof cryptoApi.randomUUID === 'function'
  ) {
    return cryptoApi.randomUUID()
  }

  if (
    typeof cryptoApi !== 'undefined' &&
    typeof cryptoApi.getRandomValues === 'function'
  ) {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))

    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
      .slice(6, 8)
      .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
  }

  throw new Error('crypto.getRandomValues is unavailable')
}

export const isValidUUID = (uuid: string | null | undefined): boolean =>
  typeof uuid === 'string' && UUID_V4.test(uuid)
