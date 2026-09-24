/**
 * Playback state preservation utilities.
 * Shared between video player and track switching operations.
 *
 * @module services/video/playback-state
 */

/**
 * Captured playback state for preservation during operations
 * that require video element manipulation (strategy switches, track changes).
 */
export interface PlaybackState {
  currentTime: number
  volume: number
  muted: boolean
  paused: boolean
}

/**
 * Default playback state when video element is unavailable.
 */
const DEFAULT_STATE: PlaybackState = {
  currentTime: 0,
  volume: 1,
  muted: false,
  paused: true,
}

/**
 * Captures the current playback state from a video element.
 * Returns default state if video is null/undefined.
 *
 * @param video - The video element to capture state from
 * @returns The captured playback state
 */
export function capturePlaybackState(
  video: HTMLVideoElement | null | undefined,
): PlaybackState {
  if (!video) return { ...DEFAULT_STATE }

  return {
    currentTime: video.currentTime,
    volume: video.volume,
    muted: video.muted,
    paused: video.paused,
  }
}

/**
 * Restores playback state (volume, mute, seek) to a video element.
 * Does not wait for video readiness or restore play state.
 *
 * @param video - The video element to restore state to
 * @param state - The state to restore
 */
export function restorePlaybackStateSync(
  video: HTMLVideoElement | null | undefined,
  state: PlaybackState,
): void {
  if (!video) return

  video.volume = state.volume
  video.muted = state.muted

  if (state.currentTime > 0 && isFinite(state.currentTime)) {
    video.currentTime = state.currentTime
  }
}
