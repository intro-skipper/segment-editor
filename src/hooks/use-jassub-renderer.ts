import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

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

interface PendingResize {
  timer: ReturnType<typeof setTimeout>
  /** Timestamp this resize is due to run at, so a later one is never pulled in. */
  deadline: number
}

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

function clearResizeTimer(
  resizeTimerRef: React.MutableRefObject<PendingResize | null>,
) {
  if (resizeTimerRef.current) {
    clearTimeout(resizeTimerRef.current.timer)
    resizeTimerRef.current = null
  }
}

function teardownJassubRenderer(
  rendererRef: React.MutableRefObject<JassubRendererResult | null>,
  resizeTimerRef: React.MutableRefObject<PendingResize | null>,
) {
  clearResizeTimer(resizeTimerRef)
  rendererRef.current?.destroy()
  rendererRef.current = null
}

function scheduleRendererResize(
  resizeTimerRef: React.MutableRefObject<PendingResize | null>,
  rendererRef: React.MutableRefObject<JassubRendererResult | null>,
  videoRef: React.RefObject<HTMLVideoElement | null>,
  prevVideoRef: React.MutableRefObject<HTMLVideoElement | null>,
  delayMs: number = PLAYER_CONFIG.RESIZE_DEBOUNCE_MS,
) {
  const deadline = Date.now() + delayMs
  const pending = resizeTimerRef.current

  // Debounce forward only. A fullscreen transition fires ResizeObserver ticks
  // while the layout is still animating; letting their shorter delay replace
  // the pending settle deadline would measure the video mid-transition.
  if (pending && pending.deadline > deadline) return
  if (pending) clearTimeout(pending.timer)

  const timer = setTimeout(() => {
    resizeTimerRef.current = null
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
      // resize() posts to the JASSUB web worker, the worker may still reject
      // asynchronously if it reads stale dimensions, so swallow the rejection.
      // The next resize after JASSUB is re-created will recover.
      void Promise.resolve(renderer.instance.resize()).catch(() => {})
    } catch (resizeError) {
      void resizeError
    }
  }, delayMs)

  resizeTimerRef.current = { timer, deadline }
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
  // Mirrored in refs, not read from props, because setUserOffset below is a
  // public handler: it runs outside any Effect, so it cannot call an Effect
  // Event, and its own writes are the newer value until the prop catches up.
  const userOffsetRef = useRef(userOffset)
  const transcodingRef = useRef(transcodingOffsetTicks)
  const resizeTimerRef = useRef<PendingResize | null>(null)
  const prevActiveTrackRef = useRef(activeTrack)
  const prevItemIdRef = useRef(item?.Id)
  const prevVideoRef = useRef<HTMLVideoElement | null>(null)
  const initTokenRef = useRef<symbol | null>(null)

  useLayoutEffect(() => {
    userOffsetRef.current = userOffset
  }, [userOffset])
  useLayoutEffect(() => {
    transcodingRef.current = transcodingOffsetTicks
  }, [transcodingOffsetTicks])

  const itemId = item?.Id

  const resize = () => {
    scheduleRendererResize(resizeTimerRef, rendererRef, videoRef, prevVideoRef)
  }

  const setUserOffset = (offset: number) => {
    userOffsetRef.current = offset
    rendererRef.current?.setTimeOffset(transcodingRef.current, offset)
  }

  // `item` and `transcodingOffsetTicks` are read when the renderer is actually
  // created, not captured when the effect ran. Neither may re-run setup, only
  // itemId does, but a renderer built from a stale item would carry the wrong
  // subtitle URLs, so the read has to be non-reactive rather than absent.
  const createRendererForTrack = useEffectEvent(
    (
      video: HTMLVideoElement,
      track: SubtitleTrackInfo,
      signal: AbortSignal,
    ): Promise<JassubRendererResult> =>
      createJassubRenderer({
        video,
        track,
        item: item!,
        transcodingOffsetTicks,
        userOffset: userOffsetRef.current,
        signal,
      }),
  )

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
      teardownJassubRenderer(rendererRef, resizeTimerRef)
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
      teardownJassubRenderer(rendererRef, resizeTimerRef)
      setRendererState((s) => ({
        ...s,
        isActive: false,
        isLoading: true,
        error: null,
      }))

      try {
        await Promise.all([
          waitForVideoMetadata(video, initAbortController.signal),
          preloadJassubRenderer(),
        ])

        if (initTokenRef.current === initToken) {
          const result = await createRendererForTrack(
            video,
            activeTrack,
            initAbortController.signal,
          )

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
  }, [activeTrack, itemId, videoRef])

  const needsJassubNow =
    !!(activeTrack && requiresJassubRenderer(activeTrack)) && !!item?.Id

  useEffect(() => {
    const video = videoRef.current
    if (!video || !isActive || !needsJassubNow) return

    const schedule = (delayMs?: number) => {
      scheduleRendererResize(
        resizeTimerRef,
        rendererRef,
        videoRef,
        prevVideoRef,
        delayMs,
      )
    }

    const observer = new ResizeObserver(() => {
      schedule()
    })
    observer.observe(video)

    // Routed through the same resizeTimerRef the cleanup below clears, rather
    // than a second setTimeout of its own: a fullscreen toggle just before
    // unmount would otherwise leave a timer this effect no longer owns, which
    // then allocates a further resize timer after teardown.
    const onFullscreen = () => {
      schedule(PLAYER_CONFIG.FULLSCREEN_RESIZE_DELAY_MS)
    }
    document.addEventListener('fullscreenchange', onFullscreen)

    return () => {
      observer.disconnect()
      document.removeEventListener('fullscreenchange', onFullscreen)
      clearResizeTimer(resizeTimerRef)
    }
  }, [videoRef, isActive, needsJassubNow])

  useEffect(() => {
    return () => {
      teardownJassubRenderer(rendererRef, resizeTimerRef)
      setRendererState((s) => ({ ...s, isActive: false }))
    }
  }, [])

  return {
    isActive: needsJassubNow && isActive,
    isLoading: needsJassubNow ? isLoading : false,
    error: needsJassubNow ? error : null,
    setUserOffset,
    resize,
  }
}
