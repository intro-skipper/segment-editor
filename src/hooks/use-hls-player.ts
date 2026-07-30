import { useEffect, useEffectEvent, useRef, useState } from 'react'
import Hls from 'hls.js'
import type { ErrorData } from 'hls.js'
import type { VideoPlayerError } from '@/services/video/playback-error'
import { PLAYER_CONFIG } from '@/lib/constants'

const { RECOVERY_TIMEOUT_MS, MEDIA_ERROR_SWAP_WINDOW_MS } = PLAYER_CONFIG

interface UseHlsPlayerOptions {
  videoUrl: string
  onError: (error: VideoPlayerError | null) => void
  onRecoveryStart: () => void
  t: (key: string) => string
}

interface UseHlsPlayerReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>
  hlsRef: React.RefObject<Hls | null>
  retry: () => void
}

const HLS_CONFIG = {
  testBandwidth: false,
  enableWorker: true,
  lowLatencyMode: false,
  startLevel: -1,
  maxBufferLength: 30,
  maxMaxBufferLength: 60,
  abrEwmaDefaultEstimate: 500000,
} as const

function clearRecoveryTimer(
  recoveryTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>,
) {
  if (recoveryTimerRef.current) {
    clearTimeout(recoveryTimerRef.current)
    recoveryTimerRef.current = null
  }
}

export function useHlsPlayer({
  videoUrl,
  onError,
  onRecoveryStart,
  t,
}: UseHlsPlayerOptions): UseHlsPlayerReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isActiveRef = useRef(true)
  /** True while a reported error has not been cleared by a success signal yet */
  const hasPendingErrorRef = useRef(false)
  const lastMediaRecoveryAtRef = useRef(Number.NEGATIVE_INFINITY)
  /** Bumped by retry() to tear down and rebuild the Hls instance */
  const [reloadToken, setReloadToken] = useState(0)
  /** Position to resume from when retry() rebuilds the instance (-1 = hls.js default) */
  const retryStartPositionRef = useRef(-1)

  const reportError = useEffectEvent((error: VideoPlayerError | null) => {
    hasPendingErrorRef.current = error !== null
    onError(error)
  })

  const reportRecoveryStart = useEffectEvent(() => {
    onRecoveryStart()
  })

  // Blind fallback-timer expiry: clear the consumer-visible error without
  // treating it as a success signal — hasPendingErrorRef stays true so a
  // later FRAG_BUFFERED still resets the media-swap window via
  // markPlaybackHealthy.
  const reportRecoveryTimedOut = useEffectEvent(() => {
    onError(null)
  })

  const createLocalizedError = useEffectEvent(
    (
      type: VideoPlayerError['type'],
      msgKey: string,
      recoverable: boolean,
    ): VideoPlayerError => ({
      type,
      message: t(msgKey),
      recoverable,
    }),
  )

  useEffect(() => {
    const video = videoRef.current
    const recoveryTimer = recoveryTimerRef

    if (!video || !videoUrl) {
      isActiveRef.current = false
      return () => {
        clearRecoveryTimer(recoveryTimer)
      }
    }

    isActiveRef.current = true
    lastMediaRecoveryAtRef.current = Number.NEGATIVE_INFINITY

    reportError(null)
    clearRecoveryTimer(recoveryTimerRef)
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (Hls.isSupported()) {
      const startPosition = retryStartPositionRef.current
      retryStartPositionRef.current = -1
      const hls = new Hls({ ...HLS_CONFIG, startPosition })
      hls.attachMedia(video)

      const handleRecovery = (
        type: 'network_error' | 'media_error',
        msgKey: string,
        recoveryFn: () => void,
      ) => {
        if (!isActiveRef.current) return

        reportError(createLocalizedError(type, msgKey, true))
        reportRecoveryStart()
        recoveryFn()

        // Fallback timer: FRAG_BUFFERED / MANIFEST_PARSED normally clear the
        // error as soon as playback actually makes progress again; this timer
        // clears it blindly if neither signal arrives in time.
        clearRecoveryTimer(recoveryTimerRef)
        recoveryTimerRef.current = setTimeout(() => {
          if (isActiveRef.current) reportRecoveryTimedOut()
        }, RECOVERY_TIMEOUT_MS)
      }

      const handleError = (
        _event: typeof Hls.Events.ERROR,
        data: ErrorData,
      ) => {
        if (!isActiveRef.current || !data.fatal) return

        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            handleRecovery('network_error', 'player.error.network', () =>
              hls.startLoad(),
            )
            break
          case Hls.ErrorTypes.MEDIA_ERROR:
            handleRecovery('media_error', 'player.error.media', () => {
              const now = performance.now()
              if (
                now - lastMediaRecoveryAtRef.current <
                MEDIA_ERROR_SWAP_WINDOW_MS
              ) {
                // Second media error shortly after a recovery attempt:
                // hls.js docs require swapping the audio codec before retrying.
                hls.swapAudioCodec()
              }
              lastMediaRecoveryAtRef.current = now
              hls.recoverMediaError()
            })
            break
          default:
            // Recoverable via the Retry button, which rebuilds the Hls
            // instance. Marking it non-recoverable would strand the user on
            // a permanent error overlay with no way out.
            reportError(
              createLocalizedError(
                'unknown_error',
                'player.error.unknown',
                true,
              ),
            )
        }
      }

      const markPlaybackHealthy = () => {
        lastMediaRecoveryAtRef.current = Number.NEGATIVE_INFINITY
        reportError(null)
        clearRecoveryTimer(recoveryTimerRef)
      }

      const handleFragBuffered = () => {
        if (!isActiveRef.current || !hasPendingErrorRef.current) return
        // A fragment appended successfully after an error: playback has
        // genuinely recovered, so clear the error overlay now instead of
        // waiting for the blind recovery timer.
        markPlaybackHealthy()
      }

      const handleManifestParsed = () => {
        if (!isActiveRef.current) return
        markPlaybackHealthy()
      }

      hls.on(Hls.Events.ERROR, handleError)
      hls.on(Hls.Events.MANIFEST_PARSED, handleManifestParsed)
      hls.on(Hls.Events.FRAG_BUFFERED, handleFragBuffered)

      hls.loadSource(videoUrl)
      hlsRef.current = hls

      return () => {
        isActiveRef.current = false
        clearRecoveryTimer(recoveryTimer)
        hls.off(Hls.Events.ERROR, handleError)
        hls.off(Hls.Events.MANIFEST_PARSED, handleManifestParsed)
        hls.off(Hls.Events.FRAG_BUFFERED, handleFragBuffered)
        hls.destroy()
        if (hlsRef.current === hls) hlsRef.current = null
      }
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = videoUrl
    }

    return () => {
      isActiveRef.current = false
      clearRecoveryTimer(recoveryTimer)
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [videoUrl, reloadToken])

  const retry = () => {
    // Rebuild the Hls instance from scratch: after a fatal error the current
    // instance (and its MediaSource) may be beyond repair, so reloading the
    // source on it is not reliable. Resume from the current position.
    const currentTime = videoRef.current?.currentTime ?? 0
    retryStartPositionRef.current = currentTime > 0 ? currentTime : -1
    setReloadToken((token) => token + 1)
  }

  return { videoRef, hlsRef, retry }
}
