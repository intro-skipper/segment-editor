import { useEffect, useEffectEvent } from 'react'
import type { PlaybackStrategy } from '@/services/video/api'
import type {
  InitialAudioTrackOptions,
  TrackSwitchResult,
} from '@/services/video/track-switching'
import type { AudioTrackInfo } from '@/services/video/tracks'
import { applyInitialAudioTrack } from '@/services/video/track-switching'

interface UseInitialAudioSelectionOptions {
  strategy: PlaybackStrategy
  videoRef: React.RefObject<HTMLVideoElement | null>
  /** The Jellyfin MediaStream index of the audio track that should play */
  activeAudioIndex: number
  audioTracks: Array<AudioTrackInfo>
  /** Changing this restarts the selection (a new item invalidates the applied track) */
  resetKey: string | undefined
  createSwitchOptions: (
    videoElement: HTMLVideoElement,
    signal: AbortSignal,
  ) => InitialAudioTrackOptions
  /** Reports a failed {@link TrackSwitchResult} (no-op on success) */
  onFailure: (result: TrackSwitchResult) => void
  onCaughtError: (err: unknown) => void
}

/**
 * Applies the initially selected audio track for direct play sessions.
 *
 * Direct play always starts on the container's default audio track, so a
 * session that starts on another track has to enable it natively once
 * metadata is available (or reload as a transcode when that is impossible).
 */
export function useInitialAudioSelection({
  strategy,
  videoRef,
  activeAudioIndex,
  audioTracks,
  resetKey,
  createSwitchOptions,
  onFailure,
  onCaughtError,
}: UseInitialAudioSelectionOptions): void {
  const hasMultipleAudioTracks = audioTracks.length > 1

  const applyInitialAudioSelection = useEffectEvent(
    async (
      video: HTMLVideoElement,
      index: number,
      signal: AbortSignal,
    ): Promise<void> => {
      try {
        const result = await applyInitialAudioTrack(
          index,
          createSwitchOptions(video, signal),
        )
        if (signal.aborted) return
        onFailure(result)
      } catch (err) {
        if (signal.aborted) return
        onCaughtError(err)
      }
    },
  )

  useEffect(() => {
    if (strategy !== 'direct' || !hasMultipleAudioTracks) return

    const video = videoRef.current
    if (!video) return

    // Aborts pending applications on cleanup so a stale run cannot enable an
    // outdated track or reload the stream after a newer selection or unmount.
    const controller = new AbortController()
    const applySelection = () => {
      void applyInitialAudioSelection(
        video,
        activeAudioIndex,
        controller.signal,
      )
    }

    // Stays subscribed: a direct-play reload (retry, error recovery) rebuilds
    // the native track list and needs the selection applied again.
    video.addEventListener('loadedmetadata', applySelection)
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      applySelection()
    }

    return () => {
      controller.abort()
      video.removeEventListener('loadedmetadata', applySelection)
    }
  }, [strategy, hasMultipleAudioTracks, activeAudioIndex, resetKey, videoRef])
}
