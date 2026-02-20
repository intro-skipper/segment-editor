/**
 * Application-wide constants.
 * Centralized location for configuration values used across the codebase.
 */

import type { MediaSegmentType } from '@/types/jellyfin'

/**
 * API request configuration constants.
 */
export const API_CONFIG = {
  /** Maximum retry attempts for failed API calls */
  MAX_RETRIES: 3,
  /** Base delay in milliseconds for exponential backoff */
  BASE_RETRY_DELAY_MS: 500,
  /** Maximum delay cap for exponential backoff (8 seconds) */
  MAX_RETRY_DELAY_MS: 8000,
  /** Default request timeout in milliseconds (30 seconds) */
  DEFAULT_TIMEOUT_MS: 30000,
  /** Timeout for segment operations (15 seconds) */
  SEGMENT_TIMEOUT_MS: 15000,
} as const

/**
 * Player configuration constants.
 */
export const PLAYER_CONFIG = {
  /** Available skip time options in seconds */
  SKIP_TIMES: [0.001, 0.01, 0.1, 1, 5] as const,
  /** Default skip time index (5 seconds) */
  DEFAULT_SKIP_TIME_INDEX: 4,
  /** Recovery timeout in milliseconds */
  RECOVERY_TIMEOUT_MS: 2000,
  /** Color extraction timeout in milliseconds */
  COLOR_EXTRACTION_TIMEOUT_MS: 5000,
  /** Resize debounce delay in milliseconds */
  RESIZE_DEBOUNCE_MS: 100,
  /** Video metadata wait timeout in milliseconds */
  VIDEO_METADATA_TIMEOUT_MS: 15_000,
  /** Fullscreen controls auto-hide delay in milliseconds */
  CONTROLS_HIDE_DELAY_MS: 3000,
  /** Mouse move throttle interval in milliseconds */
  MOUSE_MOVE_THROTTLE_MS: 500,
  /** Double-tap detection threshold in milliseconds */
  DOUBLE_TAP_THRESHOLD_MS: 300,
} as const

/**
 * Subtitle/JASSUB configuration constants.
 */
export const SUBTITLE_CONFIG = {
  /** JASSUB initialization timeout in milliseconds */
  JASSUB_READY_TIMEOUT_MS: 10_000,
  /** Default frame rate fallback */
  DEFAULT_TARGET_FPS: 24,
  /** ASS/SSA codec identifiers (case-insensitive) */
  ASS_CODECS: ['ass', 'ssa'] as const,
  /** Supported font MIME types for embedded fonts */
  SUPPORTED_FONT_TYPES: [
    'application/vnd.ms-opentype',
    'application/x-truetype-font',
    'font/otf',
    'font/ttf',
    'font/woff',
    'font/woff2',
  ] as const,
} as const

/**
 * Jellyfin API constants.
 */
export const JELLYFIN_CONFIG = {
  /** Ticks per second for Jellyfin time conversion */
  TICKS_PER_SECOND: 10_000_000,
} as const

/**
 * Segment editing constants.
 */
export const SEGMENT_CONFIG = {
  /** Minimum gap between segment start and end in seconds */
  MIN_SEGMENT_GAP: 0.1,
  /** Fine adjustment step for keyboard navigation */
  KEYBOARD_STEP_FINE: 0.1,
  /** Coarse adjustment step for keyboard navigation (with Shift) */
  KEYBOARD_STEP_COARSE: 1,
} as const

/**
 * Cache configuration constants.
 */
export const CACHE_CONFIG = {
  /** Maximum color cache entries */
  MAX_COLOR_CACHE_SIZE: 200,
  /** Maximum blob URL cache entries */
  MAX_BLOB_CACHE_SIZE: 300,
} as const

/**
 * Responsive grid column breakpoints.
 * Maps viewport width breakpoints to column counts.
 *
 * These values align with Tailwind CSS responsive classes:
 * - grid-cols-2 (default/mobile)
 * - sm:grid-cols-3
 * - md:grid-cols-4
 * - lg:grid-cols-5
 * - xl:grid-cols-6
 */
export const COLUMN_BREAKPOINTS = {
  /** Default columns for mobile (< 640px) */
  default: 2,
  /** Small screens (>= 640px) */
  sm: 3,
  /** Medium screens (>= 768px) */
  md: 4,
  /** Large screens (>= 1024px) */
  lg: 5,
  /** Extra large screens (>= 1280px) */
  xl: 6,
} as const

/**
 * Viewport width thresholds in pixels.
 * Used for responsive layout calculations.
 *
 * These values align with Tailwind CSS default breakpoints:
 * - sm: 640px
 * - md: 768px
 * - lg: 1024px
 * - xl: 1280px
 *
 * IMPORTANT: Always use these constants instead of hardcoded values
 * to ensure consistency across the application.
 */
export const VIEWPORT_BREAKPOINTS = {
  /** Small screens - tablets and larger phones */
  sm: 640,
  /** Medium screens - small laptops and tablets in landscape */
  md: 768,
  /** Large screens - laptops and desktops */
  lg: 1024,
  /** Extra large screens - large desktops */
  xl: 1280,
} as const

/**
 * Segment color configuration - single source of truth.
 * Maps segment types to their CSS variable and Tailwind class names.
 */
export const SEGMENT_COLORS: Record<
  MediaSegmentType,
  { css: string; bg: string }
> = {
  Intro: { css: 'var(--segment-intro)', bg: 'bg-segment-intro' },
  Outro: { css: 'var(--segment-outro)', bg: 'bg-segment-outro' },
  Preview: { css: 'var(--segment-preview)', bg: 'bg-segment-preview' },
  Recap: { css: 'var(--segment-recap)', bg: 'bg-segment-recap' },
  Commercial: { css: 'var(--segment-commercial)', bg: 'bg-segment-commercial' },
  Unknown: { css: 'var(--segment-unknown)', bg: 'bg-segment-unknown' },
} as const

/** Default segment color for unknown/undefined types */
export const DEFAULT_SEGMENT_COLOR = SEGMENT_COLORS.Unknown

/**
 * All available segment types.
 */
export const SEGMENT_TYPES: ReadonlyArray<MediaSegmentType> = [
  'Intro',
  'Outro',
  'Preview',
  'Recap',
  'Commercial',
  'Unknown',
] as const
