/**
 * useJassubRenderer - Hook for managing JASSUB ASS/SSA subtitle rendering.
 * @module hooks/use-jassub-renderer
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import type { BaseItemDto } from '@/types/jellyfin'
import type { SubtitleTrackInfo } from '@/services/video/tracks'
import type { JassubRendererResult } from '@/services/video/subtitle'
import {
  RESIZE_DEBOUNCE_MS,
  createJassubRenderer,
  requiresJassubRenderer,
} from '@/services/video/subtitle'
import { showError } from '@/lib/notifications'

// ============================================================================
// Types
// ============================================================================

export interface UseJassubRendererOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>
  activeTrack: SubtitleTrackInfo | null
  item: BaseItemDto | null
  transcodingOffsetTicks: number
  userOffset: number
  t: (key: string) => string
}

export interface UseJassubRendererReturn {
  isActive: boolean
  isLoading: boolean
  error: string | null
  setUserOffset: (offset: number) => void
  resize: () => void
}

// ============================================================================
// Constants
// ============================================================================

const VIDEO_METADATA_TIMEOUT_MS = 15_000

// ============================================================================
// Helper: Wait for video metadata
// ============================================================================

function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1 && video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup()
      reject(new Error('Timeout waiting for video metadata'))
    }, VIDEO_METADATA_TIMEOUT_MS)

    const cleanup = () => {
      clearTimeout(timeoutId)
      video.removeEventListener('loadedmetadata', onMetadata)
      video.removeEventListener('error', onError)
    }

    const onMetadata = () => {
      cleanup()
      resolve()
    }

    const onError = () => {
      cleanup()
      reject(new Error('Video error while waiting for metadata'))
    }

    video.addEventListener('loadedmetadata', onMetadata)
    video.addEventListener('error', onError)
  })
}

// ============================================================================
// Helper: Classify error for user-friendly messages
// ============================================================================

function classifyError(error: unknown, t: (key: string) => string): string {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error)

  if (message.includes('webgpu') || message.includes('navigator.gpu')) {
    return t('player.subtitle.error.webgpuRequired')
  }
  if (message.includes('timeout')) {
    return t('player.subtitle.error.timeout')
  }
  if (message.includes('wasm') || message.includes('worker')) {
    return t('player.subtitle.error.wasmFailed')
  }
  if (
    message.includes('fetch') ||
    message.includes('load') ||
    message.includes('network')
  ) {
    return t('player.subtitle.error.loadFailed')
  }
  return t('player.subtitle.error.jassubInit')
}

// ============================================================================
// Main Hook
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
  const transcodingOffsetRef = useRef(transcodingOffsetTicks)
  const prevTrackIndexRef = useRef<number | null>(null)
  const prevItemIdRef = useRef<string | null>(null)
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep refs in sync
  userOffsetRef.current = userOffset
  transcodingOffsetRef.current = transcodingOffsetTicks

  // ============================================================================
  // Disposal
  // ============================================================================

  const disposeRenderer = useCallback(() => {
    rendererRef.current?.dispose()
    rendererRef.current = null
    setIsActive(false)
  }, [])

  // ============================================================================
  // Resize handling
  // ============================================================================

  const handleResize = useCallback(() => {
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)

    resizeTimerRef.current = setTimeout(() => {
      rendererRef.current?.resize()
    }, RESIZE_DEBOUNCE_MS)
  }, [])

  const resize = useCallback(() => handleResize(), [handleResize])

  // ============================================================================
  // User offset update
  // ============================================================================

  const setUserOffset = useCallback((offset: number) => {
    userOffsetRef.current = offset
    rendererRef.current?.setTimeOffset(transcodingOffsetRef.current, offset)
  }, [])

  // ============================================================================
  // Initialization effect
  // ============================================================================

  useEffect(() => {
    const video = videoRef.current
    const currentItemId = item?.Id ?? null
    const currentTrackIndex = activeTrack?.index ?? null
    const needsJassub = activeTrack && requiresJassubRenderer(activeTrack)
    const hasRenderer = rendererRef.current !== null
    const sameItem = currentItemId === prevItemIdRef.current
    const sameTrack = currentTrackIndex === prevTrackIndexRef.current

    // Detect HLS reload (same track/item, existing renderer)
    const isHlsReload = needsJassub && hasRenderer && sameTrack && sameItem

    // Dynamic track switch: same item, different ASS track, renderer exists
    const canSwitchDynamically =
      needsJassub && hasRenderer && sameItem && !sameTrack && item

    prevTrackIndexRef.current = currentTrackIndex
    prevItemIdRef.current = currentItemId

    if (isHlsReload) {
      rendererRef.current?.setTimeOffset(
        transcodingOffsetTicks,
        userOffsetRef.current,
      )
      return
    }

    // Dynamic subtitle switch - reuse existing renderer
    if (canSwitchDynamically) {
      let cancelled = false

      const switchTrack = async () => {
        setIsLoading(true)
        try {
          await rendererRef.current?.setTrack({ track: activeTrack, item })
          if (!cancelled) {
            rendererRef.current?.setTimeOffset(
              transcodingOffsetTicks,
              userOffsetRef.current,
            )
          }
        } catch (err) {
          if (!cancelled) {
            const errorMessage =
              err instanceof Error ? err.message : String(err)
            setError(errorMessage)
            showError(classifyError(err, t), errorMessage)
            console.error('[JASSUB] Track switch error:', err)
          }
        } finally {
          if (!cancelled) setIsLoading(false)
        }
      }

      switchTrack()
      return () => {
        cancelled = true
      }
    }

    // Clear subtitles if renderer exists but no longer needed
    if (hasRenderer && !needsJassub) {
      // Clear track async - errors are caught inside clearTrack
      void rendererRef.current?.clearTrack()
      setIsActive(false)
      setError(null)
      // Don't dispose - keep renderer alive for potential reuse
      return
    }

    // Full disposal needed: item changed
    if (hasRenderer && !sameItem) {
      disposeRenderer()
    }

    // Exit if no JASSUB needed
    if (!needsJassub || !video || !item?.Id) {
      setError(null)
      return
    }

    let cancelled = false

    const initialize = async () => {
      setIsLoading(true)
      setError(null)

      try {
        await waitForVideoMetadata(video)
        if (cancelled) return

        const result = await createJassubRenderer({
          videoElement: video,
          track: activeTrack,
          item,
          transcodingOffsetTicks,
          userOffset: userOffsetRef.current,
        })

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cancelled can be set by cleanup during async
        if (cancelled) {
          result.dispose()
          return
        }

        rendererRef.current = result
        setIsActive(true)
        setError(null)
      } catch (err) {
        if (cancelled) return

        const errorMessage = err instanceof Error ? err.message : String(err)
        setError(errorMessage)
        showError(classifyError(err, t), errorMessage)
        console.error('[JASSUB] Initialization error:', err)
        setIsActive(false)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    initialize()

    return () => {
      cancelled = true
    }
  }, [activeTrack, item, videoRef, transcodingOffsetTicks, disposeRenderer, t])

  // ============================================================================
  // Resize listeners effect
  // ============================================================================

  useEffect(() => {
    const video = videoRef.current
    if (!video || !isActive) return

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(video)

    const onFullscreenChange = () => setTimeout(handleResize, 150)
    document.addEventListener('fullscreenchange', onFullscreenChange)

    return () => {
      resizeObserver.disconnect()
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current)
        resizeTimerRef.current = null
      }
    }
  }, [videoRef, isActive, handleResize])

  // ============================================================================
  // Cleanup on unmount
  // ============================================================================

  useEffect(() => {
    return () => {
      disposeRenderer()
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
    }
  }, [disposeRenderer])

  return { isActive, isLoading, error, setUserOffset, resize }
}
