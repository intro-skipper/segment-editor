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

import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
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
  stopPlaybackSessionKeepalive,
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
 * Options for the useVideoPlayer hook.
 */
interface UseVideoPlayerOptions {
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
interface UseVideoPlayerReturn {
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
  reloadHlsWithUrl: (newUrl: string) => Promise<void>
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
  const [error, setError] = useState<VideoPlayerError | null>(null)
  // Track which (item, audioStreamIndex) combination has finished loading
  const [loadedKey, setLoadedKey] = useState<string | undefined>(undefined)
  const itemId = item?.Id ?? null
  const mediaSourceId = item?.MediaSources?.[0]?.Id ?? null
  const itemRef = useRef(item)

  itemRef.current = item

  const networkRetryCountRef = useRef(0)
  const preservedStateRef = useRef<PlaybackState | null>(null)
  const preservedStateItemIdRef = useRef<string | null>(null)
  const pendingHlsStateRestoreRef = useRef(false)
  const isActiveRef = useRef(true)
  const playbackRequestIdRef = useRef(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const emptyHlsRef = useRef<Hls | null>(null)
  const currentStrategyRef = useRef<PlaybackStrategy>('hls')
  /** Guards against error handler firing during intentional strategy switches (e.g. audio track switch) */
  const intentionalSwitchRef = useRef(false)
  const hlsRestoreVideoRef = useRef<HTMLVideoElement | null>(null)
  const hlsCanPlayListenerRef = useRef<(() => void) | null>(null)
  const hlsRestoreFrameIdRef = useRef<number | null>(null)

  // Helper to update strategy in both state and ref
  const updateStrategy = useCallback((newStrategy: PlaybackStrategy) => {
    currentStrategyRef.current = newStrategy
    setStrategy(newStrategy)
  }, [])

  const clearPreservedState = useCallback(() => {
    preservedStateRef.current = null
    preservedStateItemIdRef.current = null
  }, [])

  const setPreservedState = useCallback(
    (
      video: HTMLVideoElement | null | undefined,
      stateItemId: string | null | undefined,
    ) => {
      if (!video || !stateItemId) {
        return
      }

      preservedStateRef.current = capturePlaybackState(video)
      preservedStateItemIdRef.current = stateItemId
    },
    [],
  )

  const getPreservedState = useCallback(
    (requestedItemId: string | null | undefined): PlaybackState | null => {
      if (
        !requestedItemId ||
        preservedStateItemIdRef.current !== requestedItemId
      ) {
        return null
      }

      return preservedStateRef.current
    },
    [],
  )

  const clearHlsStateRestoreSubscription = useCallback(() => {
    if (hlsRestoreFrameIdRef.current !== null) {
      window.cancelAnimationFrame(hlsRestoreFrameIdRef.current)
      hlsRestoreFrameIdRef.current = null
    }

    if (hlsRestoreVideoRef.current && hlsCanPlayListenerRef.current) {
      hlsRestoreVideoRef.current.removeEventListener(
        'canplay',
        hlsCanPlayListenerRef.current,
      )
    }

    hlsRestoreVideoRef.current = null
    hlsCanPlayListenerRef.current = null
  }, [])

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
        onError?.(videoError)
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

  const getActiveVideoElement = useCallback((): HTMLVideoElement | null => {
    return currentStrategyRef.current === 'hls'
      ? hlsPlayer.videoRef.current
      : videoRef.current
  }, [hlsPlayer.videoRef])

  const restoreStateAndMaybeResume = useCallback(
    (video: HTMLVideoElement, state: PlaybackState) => {
      restorePlaybackStateSync(video, state)

      if (!state.paused) {
        video.play().catch(() => {
          // Autoplay may be blocked by browser policy — ignore
        })
      }
    },
    [],
  )

  /**
   * Marks playback state for restoration when the HLS video element is ready.
   */
  const scheduleHlsStateRestore = useCallback(() => {
    if (!itemId || !getPreservedState(itemId)) {
      return
    }

    pendingHlsStateRestoreRef.current = true
    clearHlsStateRestoreSubscription()

    const attachRestore = () => {
      if (!isActiveRef.current || !pendingHlsStateRestoreRef.current) {
        return
      }

      const video = hlsPlayer.videoRef.current
      if (!video) {
        hlsRestoreFrameIdRef.current =
          window.requestAnimationFrame(attachRestore)
        return
      }

      hlsRestoreFrameIdRef.current = null

      if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        restorePendingHlsState(video)
        return
      }

      const onCanPlay = () => {
        restorePendingHlsState(video)
        clearHlsStateRestoreSubscription()
      }

      hlsRestoreVideoRef.current = video
      hlsCanPlayListenerRef.current = onCanPlay
      video.addEventListener('canplay', onCanPlay)
    }

    hlsRestoreFrameIdRef.current = window.requestAnimationFrame(attachRestore)
  }, [
    clearHlsStateRestoreSubscription,
    getPreservedState,
    hlsPlayer.videoRef,
    itemId,
  ])

  /**
   * Switches to HLS fallback strategy.
   * Preserves current playback state before switching.
   */
  const switchToHls = useCallback(
    async (requestId = playbackRequestIdRef.current) => {
      const isCurrentRequest =
        isActiveRef.current && playbackRequestIdRef.current === requestId

      if (!itemId || !isCurrentRequest) return

      // Preserve current state before switching
      if (videoRef.current) {
        setPreservedState(videoRef.current, itemId)
      }

      // Start playback session for HLS to enable server-side cleanup
      await startPlaybackSession(itemId)
      if (!isActiveRef.current || playbackRequestIdRef.current !== requestId) {
        return
      }

      const currentItem = itemRef.current
      if (!currentItem || currentItem.Id !== itemId) {
        return
      }

      // Get HLS config
      const config = await getPlaybackConfig(currentItem)
      if (playbackRequestIdRef.current !== requestId) {
        return
      }
      const hlsUrl = config.strategy === 'hls' ? config.url : ''

      // Update strategy after async operation — clear the error that triggered
      // this fallback so the overlay disappears once HLS playback begins.
      setError(null)
      updateStrategy('hls')
      setVideoUrl(hlsUrl || config.url)
      scheduleHlsStateRestore()
      onStrategyChange?.('hls')
    },
    [
      itemId,
      onStrategyChange,
      scheduleHlsStateRestore,
      setPreservedState,
      updateStrategy,
    ],
  )

  /**
   * Handles video element errors during direct play.
   * Implements fallback logic based on error type.
   */
  const handleDirectPlayError = useEffectEvent(async (event: Event) => {
    // Use the ref (synchronously updated) instead of `strategy` state which may
    // still read 'direct' after reloadHlsWithUrl has already called updateStrategy('hls').
    if (!isActiveRef.current || currentStrategyRef.current !== 'direct') return

    // Skip errors caused by intentional source changes (e.g. audio track switch
    // clearing video.src triggers MEDIA_ERR_SRC_NOT_SUPPORTED which is not a real failure)
    if (intentionalSwitchRef.current) return

    const requestId = playbackRequestIdRef.current

    const video = event.target as HTMLVideoElement
    const mediaError = video.error

    if (!mediaError) return

    const videoError = createErrorFromMediaError(mediaError, t)

    // Media errors: immediate fallback to HLS
    if (videoError.type === 'media_error') {
      setError(videoError)
      onError?.(videoError)
      await switchToHls(requestId)
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
      onError?.(videoError)
      await switchToHls(requestId)
      return
    }

    // Other errors: report and fallback
    setError(videoError)
    onError?.(videoError)
    await switchToHls(requestId)
  })

  const handleInitPlaybackSuccess = useEffectEvent(
    (
      config: { strategy: PlaybackStrategy; url: string },
      loadedItemId: string,
    ) => {
      setError(null)
      updateStrategy(config.strategy)
      setVideoUrl(config.url)
      setLoadedKey(`${loadedItemId}:${preferredAudioStreamIndex ?? ''}`)
      onStrategyChange?.(config.strategy)

      // If there is preserved state from a previous teardown (e.g. audio track
      // switch triggered a re-init), schedule restoration for HLS mode.
      // For direct play, the direct-play setup effect handles restoration.
      if (config.strategy === 'hls' && getPreservedState(loadedItemId)) {
        scheduleHlsStateRestore()
      }
    },
  )

  const handleInitPlaybackFailure = useEffectEvent(
    (err: unknown, failedItemId: string) => {
      const videoError: VideoPlayerError = {
        type: 'unknown_error',
        message: t('player.error.unknown'),
        recoverable: false,
        originalError: err instanceof Error ? err : undefined,
      }
      setError(videoError)
      setLoadedKey(`${failedItemId}:${preferredAudioStreamIndex ?? ''}`)
      onError?.(videoError)
    },
  )

  const restorePendingHlsState = useEffectEvent((video: HTMLVideoElement) => {
    if (!pendingHlsStateRestoreRef.current) {
      return
    }

    const savedState = getPreservedState(itemId)
    if (!savedState) {
      pendingHlsStateRestoreRef.current = false
      return
    }

    restoreStateAndMaybeResume(video, savedState)
    clearPreservedState()
    pendingHlsStateRestoreRef.current = false
  })

  const handlePageHide = useEffectEvent(() => {
    const video = getActiveVideoElement()
    stopPlaybackSessionKeepalive(getPositionTicks(video))
  })

  useEffect(() => {
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [])

  /**
   * Initializes playback with the appropriate strategy.
   */
  useEffect(() => {
    if (!itemId) {
      clearPreservedState()
      return
    }

    const requestId = ++playbackRequestIdRef.current
    isActiveRef.current = true
    networkRetryCountRef.current = 0
    intentionalSwitchRef.current = false
    pendingHlsStateRestoreRef.current = false
    clearHlsStateRestoreSubscription()

    const initPlayback = async () => {
      try {
        const currentItem = itemRef.current
        if (!currentItem || currentItem.Id !== itemId) {
          return
        }

        // Pass preferred audio stream index for HLS URL generation
        const config = await getPlaybackConfig(
          currentItem,
          undefined,
          preferredAudioStreamIndex,
        )

        if (playbackRequestIdRef.current !== requestId) {
          return
        }

        // Start playback session for HLS to enable server-side cleanup
        if (config.strategy === 'hls') {
          await startPlaybackSession(itemId)
          if (playbackRequestIdRef.current !== requestId) {
            return
          }
        }

        handleInitPlaybackSuccess(config, itemId)
      } catch (err) {
        if (playbackRequestIdRef.current !== requestId) {
          return
        }
        handleInitPlaybackFailure(err, itemId)
      }
    }

    void initPlayback()

    return () => {
      // Capture current playback state before teardown so position and play state
      // survive when the effect re-runs (e.g. preferredAudioStreamIndex changed
      // after an audio track switch). Without this, the re-init starts from 0.
      if (!getPreservedState(itemId)) {
        const activeVideo = getActiveVideoElement()
        if (activeVideo && activeVideo.currentTime > 0) {
          setPreservedState(activeVideo, itemId)
        }
      }

      isActiveRef.current = false
      playbackRequestIdRef.current++
      intentionalSwitchRef.current = false
      pendingHlsStateRestoreRef.current = false
      clearHlsStateRestoreSubscription()
      // Stop playback session on cleanup to trigger server-side transcoding cleanup
      // Use refs to get current values, avoiding stale closure issues
      const video = getActiveVideoElement()
      stopPlaybackSession(getPositionTicks(video))
    }
  }, [
    itemId,
    mediaSourceId,
    preferredAudioStreamIndex,
    getPreservedState,
    getActiveVideoElement,
    clearPreservedState,
    clearHlsStateRestoreSubscription,
    setPreservedState,
  ])

  /**
   * Sets up direct play video element with error handling.
   * Video element manipulation requires effect for DOM event binding.
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
    let handleCanPlay: (() => void) | null = null
    const savedState = getPreservedState(itemId)
    if (savedState) {
      handleCanPlay = () => {
        restoreStateAndMaybeResume(video, savedState)
        clearPreservedState()

        video.removeEventListener('canplay', handleCanPlay!)
      }
      video.addEventListener('canplay', handleCanPlay)
    }

    return () => {
      video.removeEventListener('error', handleDirectPlayError)
      if (handleCanPlay) {
        video.removeEventListener('canplay', handleCanPlay)
      }

      // Abort any in-flight direct play download. Setting src = '' alone doesn't
      // fully release the network connection — the browser may keep fetching.
      // removeAttribute('src') + load() tells the browser to abort and release.
      video.removeAttribute('src')
      video.load()
    }
  }, [
    strategy,
    videoUrl,
    getPreservedState,
    itemId,
    clearPreservedState,
    restoreStateAndMaybeResume,
  ])

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
      const activeVideo = getActiveVideoElement()
      setPreservedState(activeVideo, itemId)

      // Clear any stale error from a previous strategy — the user is intentionally
      // switching audio tracks, so a leftover "directPlayFailed" overlay should not persist.
      setError(null)

      // If currently in direct play mode, switch to HLS and start session
      if (currentStrategyRef.current === 'direct') {
        // Mark the switch as intentional so handleDirectPlayError ignores the
        // MEDIA_ERR_SRC_NOT_SUPPORTED that the browser fires when we clear video.src.
        intentionalSwitchRef.current = true

        try {
          // Stop the direct play video and abort the in-flight download.
          // removeAttribute('src') + load() fully releases the network connection,
          // whereas src = '' alone may not abort the fetch.
          if (videoRef.current) {
            videoRef.current.pause()
            videoRef.current.removeAttribute('src')
            videoRef.current.load()
          }

          // Start playback session for HLS (item.Id should be available)
          if (itemId) {
            await startPlaybackSession(itemId)
          }

          // Switch strategy to HLS.
          updateStrategy('hls')
          onStrategyChange?.('hls')
        } finally {
          intentionalSwitchRef.current = false
        }
      }

      // Update the URL state - this will trigger HLS.js to load the new URL
      setVideoUrl(newUrl)
      scheduleHlsStateRestore()
    },
    [
      itemId,
      getActiveVideoElement,
      onStrategyChange,
      setPreservedState,
      updateStrategy,
      scheduleHlsStateRestore,
    ],
  )

  // Use HLS player's video ref when in HLS mode
  const activeVideoRef = strategy === 'hls' ? hlsPlayer.videoRef : videoRef
  const activeHlsRef = strategy === 'hls' ? hlsPlayer.hlsRef : emptyHlsRef

  // Derive loading/error/url from item and load tracking
  const itemKey = itemId
    ? `${itemId}:${preferredAudioStreamIndex ?? ''}`
    : undefined
  const isLoading = !!itemKey && loadedKey !== itemKey
  const effectiveError = !itemId || isLoading ? null : error
  const effectiveVideoUrl = !itemId ? '' : videoUrl

  return {
    videoRef: activeVideoRef,
    hlsRef: activeHlsRef,
    strategy,
    isLoading,
    error: effectiveError,
    retry,
    videoUrl: effectiveVideoUrl,
    reloadHlsWithUrl,
  }
}
