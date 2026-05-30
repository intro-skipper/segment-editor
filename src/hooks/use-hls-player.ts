import { useEffect, useEffectEvent, useRef } from 'react'
import Hls from 'hls.js'
import { PLAYER_CONFIG } from '@/lib/constants'

const { RECOVERY_TIMEOUT_MS } = PLAYER_CONFIG

export interface HlsPlayerError {
  type: 'network' | 'media' | 'unknown'
  message: string
  recoverable: boolean
}

interface UseHlsPlayerOptions {
  videoUrl: string
  onError: (error: HlsPlayerError | null) => void
  onRecoveryStart: () => void
  onRecoveryEnd: () => void
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

const createError = (
  type: HlsPlayerError['type'],
  msgKey: string,
  t: (key: string) => string,
  recoverable: boolean,
): HlsPlayerError => ({
  type,
  message: t(msgKey),
  recoverable,
})

function clearRecoveryTimer(
  recoveryTimerRef: React.MutableRefObject<ReturnType<
    typeof setTimeout
  > | null>,
) {
  if (recoveryTimerRef.current) {
    clearTimeout(recoveryTimerRef.current)
    recoveryTimerRef.current = null
  }
}

function destroyHlsInstance(
  hlsRef: React.RefObject<Hls | null>,
  recoveryTimerRef: React.MutableRefObject<ReturnType<
    typeof setTimeout
  > | null>,
) {
  clearRecoveryTimer(recoveryTimerRef)
  if (hlsRef.current) {
    hlsRef.current.destroy()
    hlsRef.current = null
  }
}

export function useHlsPlayer({
  videoUrl,
  onError,
  onRecoveryStart,
  onRecoveryEnd,
  t,
}: UseHlsPlayerOptions): UseHlsPlayerReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isActiveRef = useRef(true)

  const reportError = useEffectEvent((error: HlsPlayerError | null) => {
    onError(error)
  })

  const reportRecoveryStart = useEffectEvent(() => {
    onRecoveryStart()
  })

  const reportRecoveryEnd = useEffectEvent(() => {
    onRecoveryEnd()
  })

  const createLocalizedError = useEffectEvent(
    (
      type: HlsPlayerError['type'],
      msgKey: string,
      recoverable: boolean,
    ): HlsPlayerError => createError(type, msgKey, t, recoverable),
  )

  useEffect(() => {
    const video = videoRef.current
    const recoveryTimer = recoveryTimerRef

    if (!video || !videoUrl) {
      isActiveRef.current = false
      return () => {
        if (recoveryTimer.current) {
          clearTimeout(recoveryTimer.current)
          recoveryTimer.current = null
        }
      }
    }

    isActiveRef.current = true

    reportError(null)
    destroyHlsInstance(hlsRef, recoveryTimerRef)

    if (Hls.isSupported()) {
      const hls = new Hls(HLS_CONFIG)
      hls.attachMedia(video)

      const handleRecovery = (
        type: 'network' | 'media',
        msgKey: string,
        recoveryFn: () => void,
      ) => {
        if (!isActiveRef.current) return

        reportError(createLocalizedError(type, msgKey, true))
        reportRecoveryStart()
        recoveryFn()

        clearRecoveryTimer(recoveryTimerRef)
        recoveryTimerRef.current = setTimeout(() => {
          if (isActiveRef.current) reportRecoveryEnd()
        }, RECOVERY_TIMEOUT_MS)
      }

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!isActiveRef.current || !data.fatal) return

        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            handleRecovery('network', 'player.error.network', () =>
              hls.startLoad(),
            )
            break
          case Hls.ErrorTypes.MEDIA_ERROR:
            handleRecovery('media', 'player.error.media', () =>
              hls.recoverMediaError(),
            )
            break
          default:
            reportError(
              createLocalizedError('unknown', 'player.error.unknown', false),
            )
        }
      })

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!isActiveRef.current) return
        reportError(null)
        clearRecoveryTimer(recoveryTimerRef)
        reportRecoveryEnd()
      })

      hls.loadSource(videoUrl)
      hlsRef.current = hls
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = videoUrl
    }

    return () => {
      isActiveRef.current = false
      if (recoveryTimer.current) {
        clearTimeout(recoveryTimer.current)
        recoveryTimer.current = null
      }
      destroyHlsInstance(hlsRef, recoveryTimerRef)
    }
  }, [videoUrl])

  const retry = () => {
    onError(null)
    hlsRef.current?.loadSource(videoUrl)
  }

  return { videoRef, hlsRef, retry }
}
