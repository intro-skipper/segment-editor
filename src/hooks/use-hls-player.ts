/**
 * useHlsPlayer - HLS.js video player hook with error recovery.
 *
 * Features:
 * - Automatic error recovery for network and media errors
 * - Proper cleanup to prevent memory leaks
 * - Safari native HLS fallback
 */

import { useCallback, useEffect, useRef } from 'react'
import Hls from 'hls.js'
import { PLAYER_CONFIG } from '@/lib/constants'

const { RECOVERY_TIMEOUT_MS } = PLAYER_CONFIG

export interface HlsPlayerError {
  type: 'network' | 'media' | 'unknown'
  message: string
  recoverable: boolean
}

export interface UseHlsPlayerOptions {
  videoUrl: string
  onError: (error: HlsPlayerError | null) => void
  onRecoveryStart: () => void
  onRecoveryEnd: () => void
  t: (key: string) => string
}

export interface UseHlsPlayerReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>
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

/**
 * Creates an HLS error object with localized message.
 */
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

  // Store latest callbacks in ref to avoid stale closures
  const callbacksRef = useRef({ onError, onRecoveryStart, onRecoveryEnd, t })
  callbacksRef.current = { onError, onRecoveryStart, onRecoveryEnd, t }

  // Cleanup recovery timer - extracted for reuse
  const clearRecoveryTimer = useCallback(() => {
    if (recoveryTimerRef.current) {
      clearTimeout(recoveryTimerRef.current)
      recoveryTimerRef.current = null
    }
  }, [])

  // Cleanup HLS instance
  const destroyHls = useCallback(() => {
    clearRecoveryTimer()
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
  }, [clearRecoveryTimer])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !videoUrl) return

    isActiveRef.current = true

    // Clear previous state
    callbacksRef.current.onError(null)
    destroyHls()

    if (Hls.isSupported()) {
      const hls = new Hls(HLS_CONFIG)
      hls.attachMedia(video)

      const handleRecovery = (
        type: 'network' | 'media',
        msgKey: string,
        recoveryFn: () => void,
      ) => {
        if (!isActiveRef.current) return

        const {
          onError: setError,
          onRecoveryStart: startRecovery,
          onRecoveryEnd: endRecovery,
          t: translate,
        } = callbacksRef.current

        setError(createError(type, msgKey, translate, true))
        startRecovery()
        recoveryFn()

        clearRecoveryTimer()
        recoveryTimerRef.current = setTimeout(() => {
          if (isActiveRef.current) endRecovery()
        }, RECOVERY_TIMEOUT_MS)
      }

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!isActiveRef.current || !data.fatal) return

        const { t: translate } = callbacksRef.current

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
            callbacksRef.current.onError(
              createError('unknown', 'player.error.unknown', translate, false),
            )
        }
      })

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!isActiveRef.current) return
        callbacksRef.current.onError(null)
        clearRecoveryTimer()
        callbacksRef.current.onRecoveryEnd()
      })

      hls.loadSource(videoUrl)
      hlsRef.current = hls
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS support
      video.src = videoUrl
    }

    return () => {
      isActiveRef.current = false
      destroyHls()
    }
  }, [videoUrl, destroyHls, clearRecoveryTimer])

  const retry = useCallback(() => {
    callbacksRef.current.onError(null)
    hlsRef.current?.loadSource(videoUrl)
  }, [videoUrl])

  return { videoRef, retry }
}
