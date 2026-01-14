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
 * Restores playback state to a video element.
 * Handles async restoration for scenarios where video needs to buffer.
 *
 * @param video - The video element to restore state to
 * @param state - The state to restore
 * @returns Promise that resolves when state is restored
 */
export async function restorePlaybackState(
  video: HTMLVideoElement | null | undefined,
  state: PlaybackState,
): Promise<void> {
  if (!video) return

  // Restore volume and mute state immediately
  video.volume = state.volume
  video.muted = state.muted

  // Wait for video to be ready before seeking
  // HAVE_CURRENT_DATA = 2 (using numeric constant for test environment compatibility)
  if (video.readyState < 2) {
    await new Promise<void>((resolve) => {
      const handleCanPlay = () => {
        video.removeEventListener('canplay', handleCanPlay)
        resolve()
      }
      video.addEventListener('canplay', handleCanPlay)
    })
  }

  // Seek to preserved position
  if (state.currentTime > 0 && isFinite(state.currentTime)) {
    video.currentTime = state.currentTime
  }

  // Restore play/pause state
  if (!state.paused) {
    try {
      await video.play()
    } catch {
      // Autoplay may be blocked, ignore
    }
  }
}

/**
 * Synchronously restores playback state (volume, mute, seek).
 * Does not wait for video readiness or restore play state.
 * Use when you need immediate restoration without async.
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
