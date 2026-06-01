import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type Hls from 'hls.js'
import type { BaseItemDto } from '@/types/jellyfin'
import type { PlaybackStrategy } from '@/services/video/api'
import {
  getPlaybackConfig,
  getPlaybackMediaSourceId,
} from '@/services/video/api'
import type { HlsReloadRequest } from '@/services/video/track-switching'
import type { PlaybackState } from '@/services/video/playback-state'
import { createPlaySessionId } from '@/services/video/session'
import { secondsToTicks } from '@/lib/time-utils'
import { useHlsPlayer } from '@/hooks/use-hls-player'
import type { HlsPlayerError } from '@/hooks/use-hls-player'
import { useJellyfinSession } from '@/hooks/use-jellyfin-session'
import type { JellyfinSessionDescriptor } from '@/hooks/use-jellyfin-session'
import { usePlaybackStatePreservation } from '@/hooks/use-playback-state-preservation'

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

type JellyfinSessionIdentity = Omit<JellyfinSessionDescriptor, 'syncEnabled'>
// Waits for React to commit the new session descriptor before calling
// jellyfin.startPlaybackStatus(positionTicksOverride).
interface PostCommitPlaybackStatusStart {
  positionTicksOverride?: number
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

function createJellyfinSessionIdentity(
  itemId: string,
  mediaSourceId: string,
  playSessionId: string,
  strategy: PlaybackStrategy,
): JellyfinSessionIdentity {
  return {
    itemId,
    mediaSourceId,
    playSessionId,
    strategy,
  }
}

function getActiveVideoElementFromRefs(
  currentStrategyRef: React.MutableRefObject<PlaybackStrategy>,
  hlsVideoRef: React.RefObject<HTMLVideoElement | null>,
  videoRef: React.RefObject<HTMLVideoElement | null>,
): HTMLVideoElement | null {
  return currentStrategyRef.current === 'hls'
    ? hlsVideoRef.current
    : videoRef.current
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
  'use memo'

  const [strategy, setStrategy] = useState<PlaybackStrategy>('hls')
  const [videoUrl, setVideoUrl] = useState('')
  const [error, setError] = useState<VideoPlayerError | null>(null)
  const [loadedKey, setLoadedKey] = useState<string | undefined>(undefined)
  const [jellyfinSessionIdentity, setJellyfinSessionIdentity] =
    useState<JellyfinSessionIdentity | null>(null)

  const itemId = item?.Id ?? null
  const mediaSourceId = item ? (getPlaybackMediaSourceId(item) ?? null) : null
  const itemRef = useRef(item)
  useLayoutEffect(() => {
    itemRef.current = item
  }, [item])

  const networkRetryCountRef = useRef(0)
  const isActiveRef = useRef(true)
  const playbackRequestIdRef = useRef(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const emptyHlsRef = useRef<Hls | null>(null)
  const currentStrategyRef = useRef<PlaybackStrategy>('hls')
  /** Guards against error handler firing during intentional strategy switches (e.g. audio track switch) */
  const intentionalSwitchRef = useRef(false)
  const pendingPostCommitStartRef =
    useRef<PostCommitPlaybackStatusStart | null>(null)

  const preservation = usePlaybackStatePreservation()

  const jellyfinSession: JellyfinSessionDescriptor | null = (() => {
    if (
      !jellyfinSessionIdentity ||
      !itemId ||
      !mediaSourceId ||
      jellyfinSessionIdentity.itemId !== itemId ||
      jellyfinSessionIdentity.mediaSourceId !== mediaSourceId
    ) {
      return null
    }

    return {
      ...jellyfinSessionIdentity,
      syncEnabled: jellyfinPlaybackSyncEnabled,
    }
  })()

  const updateStrategy = (newStrategy: PlaybackStrategy) => {
    currentStrategyRef.current = newStrategy
    setStrategy(newStrategy)
    onStrategyChange?.(newStrategy)
  }

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

  const getActiveVideoElement = () =>
    getActiveVideoElementFromRefs(
      currentStrategyRef,
      hlsPlayer.videoRef,
      videoRef,
    )

  const jellyfin = useJellyfinSession({
    session: jellyfinSession,
    getActiveVideoElement,
  })

  const flushPostCommitStart = useEffectEvent(() => {
    const postCommitStart = pendingPostCommitStartRef.current
    if (!postCommitStart) return

    pendingPostCommitStartRef.current = null
    void jellyfin.startPlaybackStatus(postCommitStart.positionTicksOverride)
  })

  useEffect(() => {
    flushPostCommitStart()
  }, [jellyfinSession])

  const switchToHls = async (requestId?: number) => {
    const resolvedRequestId = requestId ?? playbackRequestIdRef.current
    const isCurrentHlsRequest = () =>
      isActiveRef.current &&
      playbackRequestIdRef.current === resolvedRequestId &&
      itemRef.current?.Id === itemId

    if (!itemId || !mediaSourceId || !isCurrentHlsRequest()) return

    const currentItem = itemRef.current!

    // Capture direct-play position before preserving state and stopping status.
    // After updateStrategy('hls') the active video element becomes the HLS element
    // (currentTime = 0), so we must snapshot the position now.
    const directPositionTicks = secondsToTicks(
      videoRef.current?.currentTime ?? 0,
    )

    preservation.capture(videoRef.current, itemId)
    await jellyfin.stopPlaybackStatus()

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

        setError(null)
        updateStrategy('hls')
        setVideoUrl(hlsUrl || config.url)
        setJellyfinSessionIdentity(
          createJellyfinSessionIdentity(
            itemId,
            mediaSourceId,
            hlsPlaySessionId,
            'hls',
          ),
        )
        preservation.scheduleHlsRestore(hlsPlayer.videoRef, itemId)
        pendingPostCommitStartRef.current = {
          positionTicksOverride: directPositionTicks,
        }
      }
    }
  }

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
      if (
        config.strategy === 'hls' &&
        preservation.getPreserved(loadedItemId)
      ) {
        preservation.scheduleHlsRestore(hlsPlayer.videoRef, loadedItemId)
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

  const capturePlaybackStateIfNeeded = useEffectEvent((stateItemId: string) => {
    if (preservation.getPreserved(stateItemId)) return

    const activeVideo = getActiveVideoElement()
    if (activeVideo && activeVideo.currentTime > 0) {
      preservation.capture(activeVideo, stateItemId)
    }
  })

  const restoreDirectPlayStateAndClear = useEffectEvent(
    (video: HTMLVideoElement, state: PlaybackState) => {
      preservation.restoreStateAndMaybeResume(video, state)
      preservation.clear()
    },
  )

  const getPreservedPlaybackState = useEffectEvent(
    (stateItemId: string | null | undefined) =>
      preservation.getPreserved(stateItemId),
  )

  const clearPlaybackPreservation = useEffectEvent(() => {
    preservation.clear()
  })

  const clearHlsRestoreSubscription = useEffectEvent(() => {
    preservation.clearHlsRestoreSubscription()
  })

  const stopPlaybackStatus = useEffectEvent(() => {
    void jellyfin.stopPlaybackStatus()
  })

  const handlePageHide = useEffectEvent(() => {
    jellyfin.stopAllKeepalive()
  })

  useEffect(() => {
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [])

  // Keep this effect keyed only to the user toggle. Item/load changes start status
  // from the playback init path; widening these dependencies starts duplicate sessions.
  const syncPlaybackStatus = useEffectEvent(() => {
    if (!jellyfinPlaybackSyncEnabled) {
      pendingPostCommitStartRef.current = null
      void jellyfin.stopPlaybackStatus()
      return
    }

    const currentLoadedKey = `${itemId ?? ''}:${preferredAudioStreamIndex ?? ''}`
    if (loadedKey === currentLoadedKey) {
      void jellyfin.startPlaybackStatus()
    }
  })

  useEffect(() => {
    syncPlaybackStatus()
  }, [jellyfinPlaybackSyncEnabled])

  useEffect(() => {
    if (!itemId) {
      clearPlaybackPreservation()
      return
    }

    const requestId = ++playbackRequestIdRef.current
    isActiveRef.current = true
    networkRetryCountRef.current = 0
    intentionalSwitchRef.current = false
    pendingPostCommitStartRef.current = null
    clearHlsRestoreSubscription()

    const initPlayback = async () => {
      const currentItem = itemRef.current
      if (currentItem === null || currentItem.Id !== itemId) return

      try {
        const hlsPlaySessionId = createPlaySessionId()
        const config = await getPlaybackConfig(
          currentItem,
          undefined,
          preferredAudioStreamIndex,
          false,
          hlsPlaySessionId,
        )

        if (playbackRequestIdRef.current === requestId) {
          if (mediaSourceId !== null) {
            let playSessionId = hlsPlaySessionId
            if (config.strategy !== 'hls') {
              playSessionId = createPlaySessionId()
            }

            setJellyfinSessionIdentity(
              createJellyfinSessionIdentity(
                itemId,
                mediaSourceId,
                playSessionId,
                config.strategy,
              ),
            )
            handleInitPlaybackSuccess(config, itemId)
            pendingPostCommitStartRef.current = {}
          }
        }
      } catch (err) {
        if (playbackRequestIdRef.current !== requestId) return
        handleInitPlaybackFailure(err, itemId)
      }
    }

    void initPlayback()

    return () => {
      // Capture current playback state before teardown so position and play state
      // survive when the effect re-runs (e.g. preferredAudioStreamIndex changed
      // after an audio track switch). Without this, the re-init starts from 0.
      capturePlaybackStateIfNeeded(itemId)

      isActiveRef.current = false
      playbackRequestIdRef.current = Math.max(
        playbackRequestIdRef.current,
        requestId + 1,
      )
      intentionalSwitchRef.current = false
      pendingPostCommitStartRef.current = null
      clearHlsRestoreSubscription()
      stopPlaybackStatus()
    }
  }, [itemId, mediaSourceId, preferredAudioStreamIndex])

  useEffect(() => {
    if (strategy !== 'direct' || !videoUrl) return

    const video = videoRef.current
    if (!video) return

    video.addEventListener('error', handleDirectPlayError)

    video.src = videoUrl

    let handleCanPlay: (() => void) | null = null
    const savedState = getPreservedPlaybackState(itemId)
    if (savedState) {
      handleCanPlay = () => {
        restoreDirectPlayStateAndClear(video, savedState)

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
  }, [strategy, videoUrl, itemId])

  const retry = () => {
    setError(null)
    networkRetryCountRef.current = 0

    if (strategy === 'hls') {
      hlsPlayer.retry()
    } else if (videoRef.current) {
      videoRef.current.load()
    }
  }

  const reloadHlsWithUrl = async ({
    url,
    playSessionId: nextHlsPlaySessionId,
  }: HlsReloadRequest) => {
    if (!itemId || !mediaSourceId) return

    const activeVideo = getActiveVideoElement()
    const activePositionTicks = secondsToTicks(activeVideo?.currentTime ?? 0)
    preservation.capture(activeVideo, itemId)
    await jellyfin.stopPlaybackStatus()

    const previousHlsPlaySessionId =
      jellyfinSessionIdentity?.strategy === 'hls'
        ? jellyfinSessionIdentity.playSessionId
        : null
    if (
      previousHlsPlaySessionId &&
      previousHlsPlaySessionId !== nextHlsPlaySessionId
    ) {
      await jellyfin.stopPreviousEncoding(previousHlsPlaySessionId)
    }

    setError(null)

    if (currentStrategyRef.current === 'direct') {
      // Mark the switch as intentional so handleDirectPlayError ignores the
      // MEDIA_ERR_SRC_NOT_SUPPORTED that the browser fires when we clear video.src.
      intentionalSwitchRef.current = true

      // removeAttribute('src') + load() fully releases the network connection;
      // src = '' alone may not abort the in-flight fetch.
      if (videoRef.current) {
        videoRef.current.pause()
        videoRef.current.removeAttribute('src')
        videoRef.current.load()
      }

      updateStrategy('hls')
      intentionalSwitchRef.current = false
    }

    setJellyfinSessionIdentity(
      createJellyfinSessionIdentity(
        itemId,
        mediaSourceId,
        nextHlsPlaySessionId,
        'hls',
      ),
    )
    setVideoUrl(url)
    preservation.scheduleHlsRestore(hlsPlayer.videoRef, itemId)
    pendingPostCommitStartRef.current = {
      positionTicksOverride: activePositionTicks,
    }
  }

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
