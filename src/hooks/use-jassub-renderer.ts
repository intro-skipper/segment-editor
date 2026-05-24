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
  preloadJassubRenderer,
  requiresJassubRenderer,
} from '@/services/video/subtitle'
import { PLAYER_CONFIG } from '@/lib/constants'
import { showError } from '@/lib/notifications'

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

const VIDEO_METADATA_SOFT_TIMEOUT_MS = 15_000
const VIDEO_METADATA_HARD_TIMEOUT_MS = 60_000

function waitForVideoMetadata(
  video: HTMLVideoElement,
  signal?: AbortSignal,
): Promise<void> {
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
      signal?.removeEventListener('abort', onAbort)
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

    const onAbort = () => {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }

    const softTimeout = setTimeout(() => {
      if (video.readyState < 1 && !signal?.aborted) {
        video.load()
      }
    }, VIDEO_METADATA_SOFT_TIMEOUT_MS)

    const hardTimeout = setTimeout(() => {
      cleanup()
      reject(new Error('Timeout waiting for video metadata'))
    }, VIDEO_METADATA_HARD_TIMEOUT_MS)

    if (signal?.aborted) {
      onAbort()
      return
    }

    signal?.addEventListener('abort', onAbort, { once: true })
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

export function useJassubRenderer({
  videoRef,
  activeTrack,
  item,
  transcodingOffsetTicks,
  userOffset,
  t,
}: UseJassubRendererOptions): UseJassubRendererReturn {
  const [rendererState, setRendererState] = useState({
    isActive: false,
    isLoading: false,
    error: null as string | null,
  })
  const { isActive, isLoading, error } = rendererState

  const rendererRef = useRef<JassubRendererResult | null>(null)
  const userOffsetRef = useRef(userOffset)
  const transcodingRef = useRef(transcodingOffsetTicks)
  const itemRef = useRef(item)
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevActiveTrackRef = useRef(activeTrack)
  const prevItemIdRef = useRef(item?.Id)
  const prevVideoRef = useRef<HTMLVideoElement | null>(null)
  const initTokenRef = useRef<symbol | null>(null)

  userOffsetRef.current = userOffset
  transcodingRef.current = transcodingOffsetTicks
  itemRef.current = item

  const itemId = item?.Id

  const clearResizeTimer = useCallback(() => {
    if (resizeTimerRef.current) {
      clearTimeout(resizeTimerRef.current)
      resizeTimerRef.current = null
    }
  }, [])

  const teardownRenderer = useCallback(() => {
    clearResizeTimer()
    rendererRef.current?.destroy()
    rendererRef.current = null
  }, [clearResizeTimer])

  const destroyRenderer = useCallback(() => {
    teardownRenderer()
    setRendererState((s) => ({ ...s, isActive: false }))
  }, [teardownRenderer])

  const resize = useCallback(() => {
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
    resizeTimerRef.current = setTimeout(() => {
      const renderer = rendererRef.current
      if (!renderer) return

      // During strategy transitions the video element may be detached with 0×0
      // layout. JASSUB's worker would set OffscreenCanvas.width to NaN, throwing.
      const video = videoRef.current
      if (!video || video.clientWidth <= 0 || video.clientHeight <= 0) return

      // During strategy switches (direct <-> HLS) videoRef resolves to a
      // different HTMLVideoElement while the old renderer is still alive.
      // Calling resize() would make the worker read dimensions from the
      // stale/detached element, causing OffscreenCanvas errors in the worker.
      if (video !== prevVideoRef.current) return

      try {
        // resize() posts to the JASSUB web worker — the worker may still reject
        // asynchronously if it reads stale dimensions, so swallow the rejection.
        // The next resize after JASSUB is re-created will recover.
        void Promise.resolve(renderer.instance.resize()).catch(() => {})
      } catch (resizeError) {
        void resizeError
      }
    }, PLAYER_CONFIG.RESIZE_DEBOUNCE_MS)
  }, [videoRef])

  const setUserOffset = useCallback((offset: number) => {
    userOffsetRef.current = offset
    rendererRef.current?.setTimeOffset(transcodingRef.current, offset)
  }, [])

  const reportInitError = useEffectEvent((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    setRendererState((s) => ({ ...s, isLoading: false, error: msg }))
    showError(getErrorMessage(err, t), msg)
    console.error('[JASSUB] Init error:', err)
  })

  useEffect(() => {
    const video = videoRef.current
    const needsJassub = activeTrack && requiresJassubRenderer(activeTrack)

    if (!needsJassub || !video || !itemId) {
      teardownRenderer()
      return
    }

    // The video element identity check is critical: during strategy switches
    // (direct <-> HLS) the videoRef may resolve to a different HTMLVideoElement,
    // and JASSUB must be re-created against the new element.
    if (
      activeTrack === prevActiveTrackRef.current &&
      itemId === prevItemIdRef.current &&
      video === prevVideoRef.current &&
      rendererRef.current
    ) {
      return
    }

    prevActiveTrackRef.current = activeTrack
    prevItemIdRef.current = itemId
    prevVideoRef.current = video

    const initToken = Symbol('jassub-init')
    initTokenRef.current = initToken
    const initAbortController = new AbortController()

    const init = async () => {
      destroyRenderer()

      setRendererState((s) => ({ ...s, isLoading: true, error: null }))

      try {
        await Promise.all([
          waitForVideoMetadata(video, initAbortController.signal),
          preloadJassubRenderer(),
        ])

        if (initTokenRef.current === initToken) {
          const currentItem = itemRef.current
          const currentOffset = transcodingRef.current

          const result = await createJassubRenderer({
            video,
            track: activeTrack,
            item: currentItem!,
            transcodingOffsetTicks: currentOffset,
            userOffset: userOffsetRef.current,
            signal: initAbortController.signal,
          })

          if (initTokenRef.current === initToken) {
            rendererRef.current = result
            setRendererState({ isActive: true, isLoading: false, error: null })
          } else {
            result.destroy()
          }
        }
      } catch (err) {
        if (initTokenRef.current !== initToken) return
        reportInitError(err)
      }
    }

    void init()

    return () => {
      initAbortController.abort()
      if (initTokenRef.current === initToken) {
        initTokenRef.current = null
      }
    }
  }, [activeTrack, itemId, videoRef, destroyRenderer, teardownRenderer])

  const needsJassubNow =
    !!(activeTrack && requiresJassubRenderer(activeTrack)) && !!item?.Id

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
      clearResizeTimer()
    }
  }, [videoRef, isActive, resize, needsJassubNow, clearResizeTimer])

  useEffect(() => {
    return () => {
      destroyRenderer()
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
