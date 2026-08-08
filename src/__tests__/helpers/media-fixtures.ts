import type { SubtitleTrackInfo } from '@/services/video/tracks'

/**
 * A subtitle track with sensible defaults, so tests state only the fields
 * they assert on.
 */
export function subtitleTrack(
  index: number,
  overrides: Partial<SubtitleTrackInfo> = {},
): SubtitleTrackInfo {
  return {
    index,
    relativeIndex: index,
    language: 'eng',
    displayTitle: `Subtitle ${index}`,
    format: 'SRT',
    isExternal: true,
    isDefault: index === 0,
    ...overrides,
  }
}

/**
 * A detached <video> element with the given read-only layout/readiness
 * properties overridden, since jsdom reports zeros and readyState 0 otherwise.
 */
export function createVideo(
  overrides: Partial<
    Pick<
      HTMLVideoElement,
      | 'readyState'
      | 'clientWidth'
      | 'clientHeight'
      | 'videoWidth'
      | 'videoHeight'
    >
  > = {},
): HTMLVideoElement {
  const video = document.createElement('video')
  for (const [prop, value] of Object.entries(overrides)) {
    Object.defineProperty(video, prop, { value, configurable: true })
  }
  return video
}
