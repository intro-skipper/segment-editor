/**
 * useJassubRenderer - Hook for managing JASSUB ASS/SSA subtitle rendering.
 * @module hooks/use-jassub-renderer
 */

import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'

import type { BaseItemDto } from '@/types/jellyfin'
import type { SubtitleTrackInfo } from '@/services/video/tracks'
import type { JassubRendererResult } from '@/services/video/subtitle'
import {
  createJassubRenderer,
  requiresJassubRenderer,
} from '@/services/video/subtitle'
import { PLAYER_CONFIG } from '@/lib/constants'
import { showError } from '@/lib/notifications'

// ============================================================================
// Types
// ============================================================================

interface UseJassubRendererOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>
  activeTrack: SubtitleTrackInfo | null
  item: BaseItemDto | null
  transcodingOffsetTicks: number
  userOffset: number
  t: (key: string) => string
}

interface UseJassubRendererReturn {
  isActive: boolean
  isLoading: boolean
  error: string | null
  setUserOffset: (offset: number) => void
  resize: () => void
}

// ============================================================================
// Constants
// ============================================================================

const VIDEO_METADATA_SOFT_TIMEOUT_MS = 15_000
const VIDEO_METADATA_HARD_TIMEOUT_MS = 60_000

// ============================================================================
// Helpers
// ============================================================================

function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1 && video.videoWidth > 0) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(softTimeout)
      clearTimeout(hardTimeout)
      video.removeEventListener('loadedmetadata', onLoad)
      video.removeEventListener('loadeddata', onLoad)
      video.removeEventListener('canplay', onLoad)
      video.removeEventListener('error', onError)
    }

    const onLoad = () => {
      if (video.videoWidth > 0 || video.readyState >= 1) {
        cleanup()
        resolve()
      }
    }

    const onError = () => {
      cleanup()
      reject(new Error('Video error'))
    }

    const softTimeout = setTimeout(() => {
      if (video.readyState < 1) {
        video.load()
      }
    }, VIDEO_METADATA_SOFT_TIMEOUT_MS)

    const hardTimeout = setTimeout(() => {
      cleanup()
      reject(new Error('Timeout waiting for video metadata'))
    }, VIDEO_METADATA_HARD_TIMEOUT_MS)

    video.addEventListener('loadedmetadata', onLoad)
    video.addEventListener('loadeddata', onLoad)
    video.addEventListener('canplay', onLoad)
    video.addEventListener('error', onError)
  })
}

function getErrorMessage(error: unknown, t: (key: string) => string): string {
  const msg = error instanceof Error ? error.message.toLowerCase() : ''
  if (msg.includes('timeout')) return t('player.subtitle.error.timeout')
  if (msg.includes('wasm') || msg.includes('worker'))
    return t('player.subtitle.error.wasmFailed')
  if (msg.includes('fetch') || msg.includes('network'))
    return t('player.subtitle.error.loadFailed')
  return t('player.subtitle.error.jassubInit')
}

// ============================================================================
// Hook
// ============================================================================

export function useJassubRenderer({
  videoRef,
  activeTrack,
  item,
  transcodingOffsetTicks,
  userOffset,
  t,
}: UseJassubRendererOptions): UseJassubRendererReturn {
  const [isActive, setIsActive] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rendererRef = useRef<JassubRendererResult | null>(null)
  const userOffsetRef = useRef(userOffset)
  const transcodingRef = useRef(transcodingOffsetTicks)
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevActiveTrackRef = useRef(activeTrack)
  const prevItemIdRef = useRef(item?.Id)
  const prevVideoRef = useRef<HTMLVideoElement | null>(null)

  userOffsetRef.current = userOffset
  transcodingRef.current = transcodingOffsetTicks

  // Cleanup helper — also cancels any pending debounced resize to prevent
  // the timer from firing after the renderer has been destroyed.
  const teardownRenderer = useCallback(() => {
    if (resizeTimerRef.current) {
      clearTimeout(resizeTimerRef.current)
      resizeTimerRef.current = null
    }
    rendererRef.current?.destroy()
    rendererRef.current = null
  }, [])

  const destroyRenderer = useCallback(() => {
    teardownRenderer()
    setIsActive(false)
  }, [teardownRenderer])

  // Debounced resize — guards against calling JASSUB resize() when the video
  // element has invalid layout dimensions (e.g. during strategy switches when
  // the element is detached/hidden). JASSUB's worker would try to set
  // OffscreenCanvas.width to NaN, throwing a TypeError.
  const resize = useCallback(() => {
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
    resizeTimerRef.current = setTimeout(() => {
      const renderer = rendererRef.current
      if (!renderer) return

      // Validate that the video element JASSUB is bound to has real dimensions.
      // During strategy transitions the element may be detached with 0×0 layout.
      const video = videoRef.current
      if (!video || video.clientWidth <= 0 || video.clientHeight <= 0) return

      // Skip resize if the active video element no longer matches the one
      // JASSUB was created against. During strategy switches (direct <-> HLS)
      // videoRef resolves to a different HTMLVideoElement while the old
      // renderer is still alive. Calling resize() would make the worker read
      // dimensions from the stale/detached element, causing
      // "Failed to set 'width' on OffscreenCanvas" in the worker.
      if (video !== prevVideoRef.current) return

      try {
        // resize() posts to the JASSUB web worker and returns a Promise.
        // The worker may still reject asynchronously if it reads stale
        // dimensions, so swallow the rejection — the next resize after
        // JASSUB is re-created for the new element will recover.
        void Promise.resolve(renderer.instance.resize()).catch(() => {})
      } catch {
        // Synchronous errors (e.g. renderer already destroyed)
      }
    }, PLAYER_CONFIG.RESIZE_DEBOUNCE_MS)
  }, [videoRef])

  // User offset update
  const setUserOffset = useCallback((offset: number) => {
    userOffsetRef.current = offset
    rendererRef.current?.setTimeOffset(transcodingRef.current, offset)
  }, [])

  const reportInitError = useEffectEvent((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    setError(msg)
    showError(getErrorMessage(err, t), msg)
    console.error('[JASSUB] Init error:', err)
  })

  // Main effect: create/destroy renderer based on track
  useEffect(() => {
    const video = videoRef.current
    const needsJassub = activeTrack && requiresJassubRenderer(activeTrack)

    // Cleanup if no longer needed
    if (!needsJassub || !video || !item?.Id) {
      teardownRenderer()
      return
    }

    // Skip if track, item, and video element haven't changed.
    // The video element identity check is critical: during strategy switches
    // (direct <-> HLS) the videoRef may resolve to a different HTMLVideoElement,
    // and JASSUB must be re-created against the new element.
    if (
      activeTrack === prevActiveTrackRef.current &&
      item.Id === prevItemIdRef.current &&
      video === prevVideoRef.current &&
      rendererRef.current
    ) {
      return
    }

    prevActiveTrackRef.current = activeTrack
    prevItemIdRef.current = item.Id
    prevVideoRef.current = video

    let cancelled = false

    const init = async () => {
      // Destroy previous renderer first
      destroyRenderer()

      setIsLoading(true)
      setError(null)

      try {
        await waitForVideoMetadata(video)
        if (cancelled) return

        const result = await createJassubRenderer({
          video,
          track: activeTrack,
          item,
          transcodingOffsetTicks,
          userOffset: userOffsetRef.current,
        })

        rendererRef.current = result
        setIsActive(true)
      } catch (err) {
        if (cancelled) return
        reportInitError(err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    init()

    return () => {
      cancelled = true
    }
  }, [activeTrack, item, videoRef, transcodingOffsetTicks, destroyRenderer])

  const needsJassubNow =
    !!(activeTrack && requiresJassubRenderer(activeTrack)) && !!item?.Id

  // Resize observer
  useEffect(() => {
    const video = videoRef.current
    if (!video || !isActive || !needsJassubNow) return

    const observer = new ResizeObserver(resize)
    observer.observe(video)

    const onFullscreen = () => setTimeout(resize, 150)
    document.addEventListener('fullscreenchange', onFullscreen)

    return () => {
      observer.disconnect()
      document.removeEventListener('fullscreenchange', onFullscreen)
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
    }
  }, [videoRef, isActive, resize, needsJassubNow])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      destroyRenderer()
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
    }
  }, [destroyRenderer])

  return {
    isActive: needsJassubNow && isActive,
    isLoading: needsJassubNow ? isLoading : false,
    error: needsJassubNow ? error : null,
    setUserOffset,
    resize,
  }
}
