import type { MediaSegmentType } from './jellyfin'

/**
 * Data required to create a new segment from the player.
 */
export interface CreateSegmentData {
  /** The type of segment (Intro, Outro, etc.) */
  type: MediaSegmentType
  /** Start time in seconds */
  start: number
  /** End time in seconds (optional, can be set later) */
  end?: number
}

/**
 * Data for updating an existing segment's boundaries.
 */
export interface SegmentUpdate {
  /** Unique identifier of the segment */
  id: string
  /** New start time in seconds */
  start: number
  /** New end time in seconds */
  end: number
}

/**
 * Data for updating a segment's timestamp from the player.
 */
export interface TimestampUpdate {
  /** Current playback time in seconds */
  currentTime: number
  /** Whether to update the start (true) or end (false) timestamp */
  start: boolean
}

/**
 * Result of segment validation.
 */
export interface ValidationResult {
  /** Whether the segment is valid */
  valid: boolean
  /** Error message if invalid */
  error?: string
}
