/**
 * useVideoPlayer - Video player hook with direct play support and HLS fallback.
 *
 * Features:
 * - Automatic playback strategy selection (direct play vs HLS)
 * - Seamless fallback to HLS on direct play errors
 * - Playback state preservation during strategy switches
 * - Error recovery with retry logic
 *
 * @module hooks/use-video-player
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type Hls from 'hls.js'
import type { BaseItemDto } from '@/types/jellyfin'
import type { PlaybackState } from '@/services/video/playback-state'
import type { PlaybackStrategy } from '@/services/video/api'
import { getPlaybackConfig } from '@/services/video/api'
import {
  capturePlaybackState,
  restorePlaybackStateSync,
} from '@/services/video/playback-state'
import {
  getPositionTicks,
  startPlaybackSession,
  stopPlaybackSession,
} from '@/services/video/playback-session'
import { useHlsPlayer } from '@/hooks/use-hls-player'

// ============================================================================
// Types
// ============================================================================

/**
 * Error types for video playback.
 * - media_error: Codec/format issues that require fallback
 * - network_error: Connection issues that may be retryable
 * - source_error: Invalid source URL
 * - unknown_error: Unclassified errors
 */
export type VideoPlayerErrorType =
  | 'media_error'
  | 'network_error'
  | 'source_error'
  | 'unknown_error'

/**
 * Video player error with type classification and recovery info.
 */
export interface VideoPlayerError {
  type: VideoPlayerErrorType
  message: string
  recoverable: boolean
  originalError?: Error
}

/**
 * Re-export PlaybackState as PreservedPlaybackState for backward compatibility.
 * @deprecated Use PlaybackState from '@/services/video/playback-state' instead
 */
export type { PlaybackState as PreservedPlaybackState }

/**
 * @deprecated Use capturePlaybackState from '@/services/video/playback-state' instead
 */
export const preserveState = capturePlaybackState

/**
 * @deprecated Use restorePlaybackStateSync from '@/services/video/playback-state' instead
 */
export const restoreState = restorePlaybackStateSync

/**
 * Options for the useVideoPlayer hook.
 */
export interface UseVideoPlayerOptions {
  /** The Jellyfin item to play */
  item: BaseItemDto | null
  /** Preferred audio stream index for initial playback (Jellyfin MediaStream index) */
  preferredAudioStreamIndex?: number
  /** Callback when an error occurs */
  onError?: (error: VideoPlayerError) => void
  /** Callback when playback strategy changes */
  onStrategyChange?: (strategy: PlaybackStrategy) => void
  /** Translation function for error messages */
  t: (key: string) => string
}

/**
 * Return value from the useVideoPlayer hook.
 */
export interface UseVideoPlayerReturn {
  /** Ref to attach to the video element */
  videoRef: React.RefObject<HTMLVideoElement | null>
  /** Ref to the HLS.js instance (only available in HLS mode) */
  hlsRef: React.RefObject<Hls | null>
  /** Current playback strategy */
  strategy: PlaybackStrategy
  /** Whether the player is loading/initializing */
  isLoading: boolean
  /** Current error state, if any */
  error: VideoPlayerError | null
  /** Retry playback after an error */
  retry: () => void
  /** Current video URL being played */
  videoUrl: string
  /** Reload HLS stream with a new URL (for audio track switching) */
  reloadHlsWithUrl: (newUrl: string) => void
}

// ============================================================================
// Error Handling Utilities
// ============================================================================

/**
 * Maps HTML5 MediaError codes to VideoPlayerErrorType.
 */
function mapMediaErrorCode(code: number): VideoPlayerErrorType {
  switch (code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'unknown_error'
    case MediaError.MEDIA_ERR_NETWORK:
      return 'network_error'
    case MediaError.MEDIA_ERR_DECODE:
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'media_error'
    default:
      return 'unknown_error'
  }
}

/**
 * Creates a VideoPlayerError from a MediaError.
 */
function createErrorFromMediaError(
  mediaError: MediaError,
  t: (key: string) => string,
): VideoPlayerError {
  const type = mapMediaErrorCode(mediaError.code)
  const messageKey =
    type === 'network_error'
      ? 'player.error.network'
      : type === 'media_error'
        ? 'player.error.directPlayFailed'
        : 'player.error.unknown'

  return {
    type,
    message: t(messageKey),
    recoverable: type === 'network_error' || type === 'media_error',
  }
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Video player hook with direct play support and automatic HLS fallback.
 *
 * This hook manages video playback with intelligent strategy selection:
 * - Attempts direct play for compatible videos
 * - Falls back to HLS transcoding on errors
 * - Preserves playback state during strategy switches
 *
 * @param options - Hook options including item and callbacks
 * @returns Video player state and controls
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3
 */
export function useVideoPlayer({
  item,
  preferredAudioStreamIndex,
  onError,
  onStrategyChange,
  t,
}: UseVideoPlayerOptions): UseVideoPlayerReturn {
  const [strategy, setStrategy] = useState<PlaybackStrategy>('hls')
  const [videoUrl, setVideoUrl] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<VideoPlayerError | null>(null)

  const networkRetryCountRef = useRef(0)
  const preservedStateRef = useRef<PlaybackState | null>(null)
  const isActiveRef = useRef(true)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const emptyHlsRef = useRef<Hls | null>(null)
  const currentStrategyRef = useRef<PlaybackStrategy>('hls')

  // Helper to update strategy in both state and ref
  const updateStrategy = useCallback((newStrategy: PlaybackStrategy) => {
    currentStrategyRef.current = newStrategy
    setStrategy(newStrategy)
  }, [])

  // Store latest callbacks in ref to avoid stale closures
  const callbacksRef = useRef({ onError, onStrategyChange, t })
  callbacksRef.current = { onError, onStrategyChange, t }

  // HLS player hook for fallback
  const hlsPlayer = useHlsPlayer({
    videoUrl: strategy === 'hls' ? videoUrl : '',
    onError: (hlsError) => {
      if (hlsError && isActiveRef.current) {
        const videoError: VideoPlayerError = {
          type: hlsError.type === 'network' ? 'network_error' : 'media_error',
          message: hlsError.message,
          recoverable: hlsError.recoverable,
        }
        setError(videoError)
        callbacksRef.current.onError?.(videoError)
      } else {
        setError(null)
      }
    },
    onRecoveryStart: () => {
      // HLS is recovering
    },
    onRecoveryEnd: () => {
      // HLS recovery complete
    },
    t,
  })

  /**
   * Switches to HLS fallback strategy.
   * Preserves current playback state before switching.
   */
  const switchToHls = useCallback(async () => {
    if (!item?.Id || !isActiveRef.current) return

    // Preserve current state before switching
    if (videoRef.current) {
      preservedStateRef.current = capturePlaybackState(videoRef.current)
    }

    // Start playback session for HLS to enable server-side cleanup
    await startPlaybackSession(item.Id)

    // Get HLS config
    const config = await getPlaybackConfig(item)
    const hlsUrl = config.strategy === 'hls' ? config.url : ''

    // Check if still active after async operation
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (isActiveRef.current) {
      updateStrategy('hls')
      setVideoUrl(hlsUrl || config.url)
      callbacksRef.current.onStrategyChange?.('hls')
    }
  }, [item])

  /**
   * Handles video element errors during direct play.
   * Implements fallback logic based on error type.
   *
   * Requirements: 4.1, 4.2, 4.3
   */
  const handleDirectPlayError = useCallback(
    async (event: Event) => {
      if (!isActiveRef.current || strategy !== 'direct') return

      const video = event.target as HTMLVideoElement
      const mediaError = video.error

      if (!mediaError) return

      const videoError = createErrorFromMediaError(
        mediaError,
        callbacksRef.current.t,
      )

      // Media errors: immediate fallback to HLS
      if (videoError.type === 'media_error') {
        setError(videoError)
        callbacksRef.current.onError?.(videoError)
        await switchToHls()
        return
      }

      // Network errors: retry once, then fallback
      if (videoError.type === 'network_error') {
        if (networkRetryCountRef.current < 1) {
          networkRetryCountRef.current++
          // Retry by reloading the source
          video.load()
          return
        }

        // Max retries reached, fallback to HLS
        setError(videoError)
        callbacksRef.current.onError?.(videoError)
        await switchToHls()
        return
      }

      // Other errors: report and fallback
      setError(videoError)
      callbacksRef.current.onError?.(videoError)
      await switchToHls()
    },
    [strategy, switchToHls],
  )

  /**
   * Initializes playback with the appropriate strategy.
   */
  useEffect(() => {
    if (!item?.Id) {
      setIsLoading(false)
      setVideoUrl('')
      return
    }

    isActiveRef.current = true
    setIsLoading(true)
    setError(null)
    networkRetryCountRef.current = 0

    const initPlayback = async () => {
      try {
        // Pass preferred audio stream index for HLS URL generation
        const config = await getPlaybackConfig(
          item,
          undefined,
          preferredAudioStreamIndex,
        )

        if (!isActiveRef.current) return

        // Start playback session for HLS to enable server-side cleanup
        if (config.strategy === 'hls') {
          await startPlaybackSession(item.Id!)
        }

        updateStrategy(config.strategy)
        setVideoUrl(config.url)
        setIsLoading(false)
        callbacksRef.current.onStrategyChange?.(config.strategy)
      } catch (err) {
        if (!isActiveRef.current) return

        const videoError: VideoPlayerError = {
          type: 'unknown_error',
          message: callbacksRef.current.t('player.error.unknown'),
          recoverable: false,
          originalError: err instanceof Error ? err : undefined,
        }
        setError(videoError)
        setIsLoading(false)
        callbacksRef.current.onError?.(videoError)
      }
    }

    initPlayback()

    return () => {
      isActiveRef.current = false
      // Stop playback session on cleanup to trigger server-side transcoding cleanup
      // Use refs to get current values, avoiding stale closure issues
      const video =
        currentStrategyRef.current === 'hls'
          ? hlsPlayer.videoRef.current
          : videoRef.current
      stopPlaybackSession(getPositionTicks(video))
    }
  }, [item, preferredAudioStreamIndex, hlsPlayer.videoRef])

  /**
   * Sets up direct play video element with error handling.
   */
  useEffect(() => {
    if (strategy !== 'direct' || !videoUrl) return

    const video = videoRef.current
    if (!video) return

    // Set up error handler for direct play
    video.addEventListener('error', handleDirectPlayError)

    // Set the source
    video.src = videoUrl

    // Restore preserved state if available
    if (preservedStateRef.current) {
      const handleCanPlay = () => {
        if (preservedStateRef.current) {
          restorePlaybackStateSync(video, preservedStateRef.current)
          preservedStateRef.current = null
        }
        video.removeEventListener('canplay', handleCanPlay)
      }
      video.addEventListener('canplay', handleCanPlay)
    }

    return () => {
      video.removeEventListener('error', handleDirectPlayError)
    }
  }, [strategy, videoUrl, handleDirectPlayError])

  /**
   * Restores state when HLS player is ready after URL change.
   * This handles both initial load and audio track switching reloads.
   */
  useEffect(() => {
    if (strategy !== 'hls' || !hlsPlayer.videoRef.current || !videoUrl) return

    const video = hlsPlayer.videoRef.current
    if (preservedStateRef.current) {
      const handleCanPlay = () => {
        if (preservedStateRef.current) {
          restorePlaybackStateSync(video, preservedStateRef.current)
          preservedStateRef.current = null
        }
        video.removeEventListener('canplay', handleCanPlay)
      }
      video.addEventListener('canplay', handleCanPlay)

      return () => {
        video.removeEventListener('canplay', handleCanPlay)
      }
    }
  }, [strategy, hlsPlayer.videoRef, videoUrl])

  /**
   * Retry playback after an error.
   */
  const retry = useCallback(() => {
    setError(null)
    networkRetryCountRef.current = 0

    if (strategy === 'hls') {
      hlsPlayer.retry()
    } else if (videoRef.current) {
      videoRef.current.load()
    }
  }, [strategy, hlsPlayer])

  /**
   * Reload HLS stream with a new URL.
   * Used for audio track switching which requires a new transcode session.
   * Also handles switching from direct play to HLS mode when needed.
   */
  const reloadHlsWithUrl = useCallback(
    async (newUrl: string) => {
      // Preserve current playback state from whichever video element is active
      const activeVideo =
        currentStrategyRef.current === 'hls'
          ? hlsPlayer.videoRef.current
          : videoRef.current
      if (activeVideo) {
        preservedStateRef.current = capturePlaybackState(activeVideo)
      }

      // If currently in direct play mode, switch to HLS and start session
      if (currentStrategyRef.current === 'direct') {
        // Stop the direct play video
        if (videoRef.current) {
          videoRef.current.pause()
          videoRef.current.src = ''
        }

        // Start playback session for HLS (item.Id should be available)
        if (item?.Id) {
          await startPlaybackSession(item.Id)
        }

        // Switch strategy to HLS
        updateStrategy('hls')
        callbacksRef.current.onStrategyChange?.('hls')
      }

      // Update the URL state - this will trigger HLS.js to load the new URL
      setVideoUrl(newUrl)
    },
    [item?.Id, hlsPlayer.videoRef, updateStrategy],
  )

  // Use HLS player's video ref when in HLS mode
  const activeVideoRef = strategy === 'hls' ? hlsPlayer.videoRef : videoRef
  const activeHlsRef = strategy === 'hls' ? hlsPlayer.hlsRef : emptyHlsRef

  return {
    videoRef: activeVideoRef,
    hlsRef: activeHlsRef,
    strategy,
    isLoading,
    error,
    retry,
    videoUrl,
    reloadHlsWithUrl,
  }
}
