/**
 * Player-facing playback error type.
 * Shared between the HLS player hook, the video player hook, and the
 * player surface so producers emit the exact shape consumers render.
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
