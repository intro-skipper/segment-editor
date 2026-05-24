import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import type Hls from 'hls.js'
import type { BaseItemDto } from '@/types/jellyfin'
import type { PlaybackState } from '@/services/video/playback-state'
import type { PlaybackStrategy } from '@/services/video/api'
import {
  getPlaybackConfig,
  getPlaybackMediaSourceId,
} from '@/services/video/api'
import type { HlsReloadRequest } from '@/services/video/track-switching'
import {
  capturePlaybackState,
  restorePlaybackStateSync,
} from '@/services/video/playback-state'
import { createPlaySessionId } from '@/services/video/session'
import { secondsToTicks } from '@/lib/time-utils'
import { useHlsPlayer } from '@/hooks/use-hls-player'
import type { HlsPlayerError } from '@/hooks/use-hls-player'
import { useHlsEncoding } from '@/hooks/use-hls-encoding'
import { usePlaybackStatus } from '@/hooks/use-playback-status'

export type VideoPlayerErrorType =
  | 'media_error'
  | 'network_error'
  | 'source_error'
  | 'unknown_error'

export interface VideoPlayerError {
  type: VideoPlayerErrorType
  message: string
  recoverable: boolean
  originalError?: Error
}

interface UseVideoPlayerOptions {
  item: BaseItemDto | null
  preferredAudioStreamIndex?: number
  jellyfinPlaybackSyncEnabled?: boolean
  onError?: (error: VideoPlayerError) => void
  onStrategyChange?: (strategy: PlaybackStrategy) => void
  onRecoveryStart?: () => void
  onRecoveryEnd?: () => void
  t: (key: string) => string
}

interface UseVideoPlayerReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>
  hlsRef: React.RefObject<Hls | null>
  strategy: PlaybackStrategy
  isLoading: boolean
  error: VideoPlayerError | null
  retry: () => void
  videoUrl: string
  reloadHlsWithUrl: (reload: HlsReloadRequest) => Promise<void>
}

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

export function useVideoPlayer({
  item,
  preferredAudioStreamIndex,
  jellyfinPlaybackSyncEnabled = false,
  onError,
  onStrategyChange,
  onRecoveryStart,
  onRecoveryEnd,
  t,
}: UseVideoPlayerOptions): UseVideoPlayerReturn {
  const [strategy, setStrategy] = useState<PlaybackStrategy>('hls')
  const [videoUrl, setVideoUrl] = useState('')
  const [error, setError] = useState<VideoPlayerError | null>(null)
  const [loadedKey, setLoadedKey] = useState<string | undefined>(undefined)
  const itemId = item?.Id ?? null
  const mediaSourceId = item ? (getPlaybackMediaSourceId(item) ?? null) : null
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
  const playbackSyncEnabledRef = useRef(jellyfinPlaybackSyncEnabled)
  /** Guards against error handler firing during intentional strategy switches (e.g. audio track switch) */
  const intentionalSwitchRef = useRef(false)
  const hlsRestoreVideoRef = useRef<HTMLVideoElement | null>(null)
  const hlsCanPlayListenerRef = useRef<(() => void) | null>(null)
  const hlsRestoreFrameIdRef = useRef<number | null>(null)

  const updateStrategy = useCallback(
    (newStrategy: PlaybackStrategy) => {
      currentStrategyRef.current = newStrategy
      setStrategy(newStrategy)
      onStrategyChange?.(newStrategy)
    },
    [onStrategyChange],
  )

  playbackSyncEnabledRef.current = jellyfinPlaybackSyncEnabled

  const clearPreservedState = useCallback(() => {
    preservedStateRef.current = null
    preservedStateItemIdRef.current = null
  }, [])

  const hlsEncoding = useHlsEncoding()
  const {
    hlsPlaySessionIdRef,
    setHlsPlaySessionId,
    stopCurrentHlsEncoding,
    stopCurrentHlsEncodingKeepalive,
    stopPreviousHlsEncoding,
  } = hlsEncoding

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

  const handleHlsError = (hlsError: HlsPlayerError | null) => {
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
  }

  const handleHlsRecoveryStart = () => onRecoveryStart?.()
  const handleHlsRecoveryEnd = () => onRecoveryEnd?.()

  const hlsPlayer = useHlsPlayer({
    videoUrl: strategy === 'hls' ? videoUrl : '',
    onError: handleHlsError,
    onRecoveryStart: handleHlsRecoveryStart,
    onRecoveryEnd: handleHlsRecoveryEnd,
    t,
  })

  const getActiveVideoElement = useCallback((): HTMLVideoElement | null => {
    return currentStrategyRef.current === 'hls'
      ? hlsPlayer.videoRef.current
      : videoRef.current
  }, [hlsPlayer.videoRef])

  const playbackStatus = usePlaybackStatus({
    itemId,
    mediaSourceId,
    itemRef,
    isActiveRef,
    playbackRequestIdRef,
    playbackSyncEnabledRef,
    hlsPlaySessionIdRef: hlsPlaySessionIdRef,
    currentStrategyRef,
    getActiveVideoElement,
    strategy,
    jellyfinPlaybackSyncEnabled,
  })

  const {
    startCurrentPlaybackStatus,
    stopCurrentPlaybackStatus,
    stopCurrentPlaybackStatusKeepalive,
  } = playbackStatus

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

  const restorePendingHlsState = useCallback(
    (video: HTMLVideoElement) => {
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
    },
    [
      clearPreservedState,
      getPreservedState,
      itemId,
      restoreStateAndMaybeResume,
    ],
  )

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
    restorePendingHlsState,
  ])

  const switchToHls = useCallback(
    async (requestId?: number) => {
      const resolvedRequestId = requestId ?? playbackRequestIdRef.current
      const isCurrentHlsRequest = () =>
        isActiveRef.current &&
        playbackRequestIdRef.current === resolvedRequestId &&
        itemRef.current?.Id === itemId

      if (!itemId || !isCurrentHlsRequest()) return

      const currentItem = itemRef.current!

      // Capture direct-play position before preserving state and stopping status.
      // After updateStrategy('hls') the active video element becomes the HLS element
      // (currentTime = 0), so we must snapshot the position now.
      const directPositionTicks = secondsToTicks(
        videoRef.current?.currentTime ?? 0,
      )

      if (videoRef.current) {
        setPreservedState(videoRef.current, itemId)
      }
      await stopCurrentPlaybackStatus()

      const hlsPlaySessionId = createPlaySessionId()

      if (isCurrentHlsRequest()) {
        // Force HLS config: direct-play fallback must not reuse a direct stream URL.
        const config = await getPlaybackConfig(
          currentItem,
          undefined,
          undefined,
          true,
          hlsPlaySessionId,
        )
        if (isCurrentHlsRequest()) {
          const hlsUrl = config.strategy === 'hls' ? config.url : ''
          setHlsPlaySessionId(hlsPlaySessionId)

          setError(null)
          updateStrategy('hls')
          setVideoUrl(hlsUrl || config.url)
          scheduleHlsStateRestore()
          await startCurrentPlaybackStatus(directPositionTicks)
        }
      }
    },
    [
      setHlsPlaySessionId,
      itemId,
      playbackRequestIdRef,
      scheduleHlsStateRestore,
      setPreservedState,
      startCurrentPlaybackStatus,
      stopCurrentPlaybackStatus,
      updateStrategy,
    ],
  )

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

    if (videoError.type === 'media_error') {
      setError(videoError)
      onError?.(videoError)
      await switchToHls(requestId)
      return
    }

    if (videoError.type === 'network_error') {
      if (networkRetryCountRef.current < 1) {
        networkRetryCountRef.current++
        video.load()
        return
      }

      setError(videoError)
      onError?.(videoError)
      await switchToHls(requestId)
      return
    }

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

  const handlePageHide = useEffectEvent(() => {
    stopCurrentPlaybackStatusKeepalive()
    stopCurrentHlsEncodingKeepalive()
  })

  useEffect(() => {
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [])

  const syncPlaybackStatus = useEffectEvent((enabled: boolean) => {
    playbackSyncEnabledRef.current = enabled
    if (!enabled) {
      void stopCurrentPlaybackStatus()
      return
    }

    const currentLoadedKey = `${itemId ?? ''}:${preferredAudioStreamIndex ?? ''}`
    if (loadedKey === currentLoadedKey) {
      void startCurrentPlaybackStatus()
    }
  })

  useEffect(() => {
    syncPlaybackStatus(jellyfinPlaybackSyncEnabled)
  }, [jellyfinPlaybackSyncEnabled])

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

        const hlsPlaySessionId = createPlaySessionId()
        const config = await getPlaybackConfig(
          currentItem,
          undefined,
          preferredAudioStreamIndex,
          false,
          hlsPlaySessionId,
        )

        if (playbackRequestIdRef.current === requestId) {
          setHlsPlaySessionId(
            config.strategy === 'hls' ? hlsPlaySessionId : null,
          )

          handleInitPlaybackSuccess(config, itemId)
          await startCurrentPlaybackStatus()
        }
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
      playbackRequestIdRef.current = Math.max(
        playbackRequestIdRef.current,
        requestId + 1,
      )
      intentionalSwitchRef.current = false
      pendingHlsStateRestoreRef.current = false
      clearHlsStateRestoreSubscription()
      void stopCurrentPlaybackStatus()
      void stopCurrentHlsEncoding()
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
    startCurrentPlaybackStatus,
    stopCurrentPlaybackStatus,
    setHlsPlaySessionId,
    stopCurrentHlsEncoding,
  ])

  useEffect(() => {
    if (strategy !== 'direct' || !videoUrl) return

    const video = videoRef.current
    if (!video) return

    video.addEventListener('error', handleDirectPlayError)

    video.src = videoUrl

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

  const retry = useCallback(() => {
    setError(null)
    networkRetryCountRef.current = 0

    if (strategy === 'hls') {
      hlsPlayer.retry()
    } else if (videoRef.current) {
      videoRef.current.load()
    }
  }, [strategy, hlsPlayer.retry])

  const reloadHlsWithUrl = useCallback(
    async ({ url, playSessionId: nextHlsPlaySessionId }: HlsReloadRequest) => {
      const activeVideo = getActiveVideoElement()
      const activePositionTicks = secondsToTicks(activeVideo?.currentTime ?? 0)
      setPreservedState(activeVideo, itemId)
      await stopCurrentPlaybackStatus()
      const previousHlsPlaySessionId = hlsPlaySessionIdRef.current
      if (
        previousHlsPlaySessionId &&
        previousHlsPlaySessionId !== nextHlsPlaySessionId
      ) {
        await stopPreviousHlsEncoding(previousHlsPlaySessionId)
      }
      setHlsPlaySessionId(nextHlsPlaySessionId)

      setError(null)

      if (currentStrategyRef.current === 'direct') {
        // Mark the switch as intentional so handleDirectPlayError ignores the
        // MEDIA_ERR_SRC_NOT_SUPPORTED that the browser fires when we clear video.src.
        intentionalSwitchRef.current = true

        try {
          // removeAttribute('src') + load() fully releases the network connection;
          // src = '' alone may not abort the in-flight fetch.
          if (videoRef.current) {
            videoRef.current.pause()
            videoRef.current.removeAttribute('src')
            videoRef.current.load()
          }

          updateStrategy('hls')
        } finally {
          intentionalSwitchRef.current = false
        }
      }

      setVideoUrl(url)
      scheduleHlsStateRestore()
      void startCurrentPlaybackStatus(activePositionTicks)
    },
    [
      hlsPlaySessionIdRef,
      stopPreviousHlsEncoding,
      setHlsPlaySessionId,
      itemId,
      getActiveVideoElement,
      setPreservedState,
      updateStrategy,
      scheduleHlsStateRestore,
      startCurrentPlaybackStatus,
      stopCurrentPlaybackStatus,
    ],
  )

  const activeVideoRef = strategy === 'hls' ? hlsPlayer.videoRef : videoRef
  const activeHlsRef = strategy === 'hls' ? hlsPlayer.hlsRef : emptyHlsRef

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
