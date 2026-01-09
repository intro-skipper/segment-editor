/**
 * Subtitle rendering module - public API.
 * @module services/video/subtitle
 */

// Types
export type {
  JassubInstance,
  JassubRendererResult,
  CreateJassubOptions,
} from './types'

// Constants (re-exported from centralized constants)
export {
  SUPPORTED_FONT_TYPES,
  ASS_CODECS,
  TICKS_PER_SECOND,
  RESIZE_DEBOUNCE_MS,
} from './constants'

// Utilities (consolidated)
export {
  // Format detection
  isAssCodec,
  requiresJassubRenderer,
  // Time utilities
  calculateTimeOffset,
  getVideoFrameRate,
  // URL building
  getSubtitleUrl,
  fetchSubtitleContent,
  // WebGPU detection
  isWebGPUAvailable,
  // DOM utilities
  applyJassubOverlayStyles,
} from './utils'

// Font loading
export {
  extractEmbeddedFontUrls,
  fetchFallbackFontUrls,
  buildAvailableFonts,
} from './font-loader'

// Main renderer
export { createJassubRenderer } from './renderer'
