/**
 * Subtitle rendering types and interfaces.
 * @module services/video/subtitle/types
 */

import type { SubtitleTrackInfo } from '../tracks'
import type { BaseItemDto } from '@/types/jellyfin'

/**
 * JASSUB instance interface (dynamically imported).
 * Only includes methods actually used by the renderer.
 */
export interface JassubInstance {
  destroy: () => void
  resize: () => void
  ready: Promise<void>
  renderer: {
    timeOffset: number
    setTrack: (content: string) => Promise<void>
  }
}

/**
 * Options for creating a JASSUB renderer.
 */
export interface CreateJassubOptions {
  videoElement: HTMLVideoElement
  track: SubtitleTrackInfo
  item: BaseItemDto
  transcodingOffsetTicks: number
  userOffset: number
}

/**
 * Options for switching subtitle tracks dynamically.
 */
export interface SetTrackOptions {
  track: SubtitleTrackInfo
  item: BaseItemDto
}

/**
 * Result of JASSUB renderer creation.
 */
export interface JassubRendererResult {
  instance: JassubInstance
  dispose: () => void
  setTimeOffset: (transcodingTicks: number, userOffset: number) => void
  resize: () => void
  setTrack: (options: SetTrackOptions) => Promise<void>
  clearTrack: () => Promise<void>
}
