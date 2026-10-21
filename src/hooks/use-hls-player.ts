import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type Hls from 'hls.js'
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

// Outside the hook: React Compiler cannot lower import() expressions.
const loadHls = () => import('hls.js')
// Set by the first successful load, so later mounts start with the class and
// skip the async gap and its extra render.
let loadedHls: typeof Hls | null = null

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
  /** hls.js, loaded once an HLS url needs it so direct play never downloads it */
  const [HlsClass, setHlsClass] = useState<typeof Hls | null>(() => loadedHls)

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
    if (!videoUrl || HlsClass) return

    let cancelled = false
    loadHls()
      .then(({ default: Hls }) => {
        loadedHls = Hls
        if (!cancelled) setHlsClass(() => Hls)
      })
      .catch((error: unknown) => {
        // A failed chunk load; Retry attempts the import again.
        console.error('HLS setup failed', error)
        if (!cancelled) {
          reportError(
            createLocalizedError('unknown_error', 'player.error.unknown', true),
          )
        }
      })

    return () => {
      cancelled = true
    }
  }, [videoUrl, reloadToken, HlsClass])

  useEffect(() => {
    const video = videoRef.current
    const recoveryTimer = recoveryTimerRef

    if (!video || !videoUrl || !HlsClass) {
      isActiveRef.current = false
      return () => {
        clearRecoveryTimer(recoveryTimer)
      }
    }

    isActiveRef.current = true
    lastMediaRecoveryAtRef.current = Number.NEGATIVE_INFINITY

    reportError(null)
    clearRecoveryTimer(recoveryTimerRef)

    if (!HlsClass.isSupported()) {
      // Native HLS (Safari): the element plays the stream itself, so there is
      // no Hls instance or listener to destroy.
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = videoUrl
      }
      return
    }

    const startPosition = retryStartPositionRef.current
    retryStartPositionRef.current = -1
    const hls = new HlsClass({ ...HLS_CONFIG, startPosition })
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
      _event: typeof HlsClass.Events.ERROR,
      data: ErrorData,
    ) => {
      if (!isActiveRef.current || !data.fatal) return

      // An if-chain, not a switch: React Compiler cannot reorder the
      // member-expression case tests of a locally bound HlsClass.
      if (data.type === HlsClass.ErrorTypes.NETWORK_ERROR) {
        handleRecovery('network_error', 'player.error.network', () =>
          hls.startLoad(),
        )
      } else if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR) {
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
      } else {
        // Recoverable via the Retry button, which rebuilds the Hls
        // instance. Marking it non-recoverable would strand the user on
        // a permanent error overlay with no way out.
        reportError(
          createLocalizedError('unknown_error', 'player.error.unknown', true),
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

    hls.on(HlsClass.Events.ERROR, handleError)
    hls.on(HlsClass.Events.MANIFEST_PARSED, handleManifestParsed)
    hls.on(HlsClass.Events.FRAG_BUFFERED, handleFragBuffered)

    hls.loadSource(videoUrl)
    hlsRef.current = hls

    return () => {
      isActiveRef.current = false
      clearRecoveryTimer(recoveryTimer)
      // destroy() also removes every listener registered above.
      hls.destroy()
      if (hlsRef.current === hls) hlsRef.current = null
    }
  }, [videoUrl, reloadToken, HlsClass])

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
