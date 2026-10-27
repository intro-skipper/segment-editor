/**
 * Player-facing playback error type.
 * Shared between the playback engine and the player surface so the
 * producer emits the exact shape the consumer renders.
 *
 * @module services/video/playback-error
 */

export type VideoPlayerErrorType =
  | 'media_error'
  | 'network_error'
  | 'unknown_error'

export interface VideoPlayerError {
  type: VideoPlayerErrorType
  message: string
  recoverable: boolean
}
