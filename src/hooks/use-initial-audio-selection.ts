import { useEffect, useEffectEvent } from 'react'
import type { PlaybackStrategy } from '@/services/video/api'
import type {
  TrackSwitchOptions,
  TrackSwitchResult,
} from '@/services/video/track-switching'
import { applyInitialAudioTrack } from '@/services/video/track-switching'
import { runTrackOperation } from '@/services/video/track-operation'

interface UseInitialAudioSelectionOptions {
  strategy: PlaybackStrategy
  videoRef: React.RefObject<HTMLVideoElement | null>
  /** The Jellyfin MediaStream index of the audio track that should play */
  activeAudioIndex: number
  hasMultipleAudioTracks: boolean
  /** Index of the track the container plays by default (undefined when the
   * item has no audio tracks) */
  containerDefaultAudioIndex: number | undefined
  /** Changing this restarts the selection (a new item invalidates the applied track) */
  resetKey: string | undefined
  createSwitchOptions: (
    videoElement: HTMLVideoElement,
    signal: AbortSignal,
  ) => TrackSwitchOptions
  /** Held true while an application runs, so the UI can disable track
   * selection during the (possibly stream-reloading) window */
  setPending: (pending: boolean) => void
  /** Receives the index the application targeted and its outcome; on failure
   * the element is still playing the container default track */
  onResult: (index: number, result: TrackSwitchResult) => void
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
  hasMultipleAudioTracks,
  containerDefaultAudioIndex,
  resetKey,
  createSwitchOptions,
  setPending,
  onResult,
  onCaughtError,
}: UseInitialAudioSelectionOptions): void {
  const applyInitialAudioSelection = useEffectEvent(
    async (
      video: HTMLVideoElement,
      index: number,
      signal: AbortSignal,
    ): Promise<void> => {
      await runTrackOperation(
        () => applyInitialAudioTrack(index, createSwitchOptions(video, signal)),
        {
          signal,
          setPending,
          onResult: (result) => onResult(index, result),
          onCaughtError,
        },
      )
    },
  )

  const confirmDefaultSelection = useEffectEvent((index: number): void => {
    onResult(index, { success: true })
  })

  useEffect(() => {
    if (strategy !== 'direct' || !hasMultipleAudioTracks) return

    const video = videoRef.current
    if (!video) return

    // The container default is already playing: record it as the confirmed
    // selection without the async no-op round trip (and its pending-flag
    // renders) the service would run on every playback start otherwise.
    if (activeAudioIndex === containerDefaultAudioIndex) {
      confirmDefaultSelection(activeAudioIndex)
      return
    }

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
  }, [
    strategy,
    hasMultipleAudioTracks,
    activeAudioIndex,
    containerDefaultAudioIndex,
    resetKey,
    videoRef,
  ])
}
