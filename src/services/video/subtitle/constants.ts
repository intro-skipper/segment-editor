/**
 * Subtitle rendering constants.
 * Re-exports from centralized constants for module convenience.
 * @module services/video/subtitle/constants
 */

import {
  JELLYFIN_CONFIG,
  PLAYER_CONFIG,
  SUBTITLE_CONFIG,
} from '@/lib/constants'

// Re-export for module consumers
export const SUPPORTED_FONT_TYPES = SUBTITLE_CONFIG.SUPPORTED_FONT_TYPES
export const ASS_CODECS = SUBTITLE_CONFIG.ASS_CODECS
export const TICKS_PER_SECOND = JELLYFIN_CONFIG.TICKS_PER_SECOND
export const DEFAULT_TARGET_FPS = SUBTITLE_CONFIG.DEFAULT_TARGET_FPS
export const RESIZE_DEBOUNCE_MS = PLAYER_CONFIG.RESIZE_DEBOUNCE_MS
export const JASSUB_READY_TIMEOUT_MS = SUBTITLE_CONFIG.JASSUB_READY_TIMEOUT_MS
export const VIDEO_METADATA_TIMEOUT_MS = PLAYER_CONFIG.VIDEO_METADATA_TIMEOUT_MS
