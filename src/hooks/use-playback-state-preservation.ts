import { useCallback, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import type { PlaybackState } from '@/services/video/playback-state'
import {
  capturePlaybackState,
  restorePlaybackStateSync,
} from '@/services/video/playback-state'

export interface UsePlaybackStatePreservationReturn {
  capture: (
    video: HTMLVideoElement | null | undefined,
    itemId: string | null | undefined,
  ) => void
  getPreserved: (itemId: string | null | undefined) => PlaybackState | null
  clear: () => void
  restoreStateAndMaybeResume: (
    video: HTMLVideoElement,
    state: PlaybackState,
  ) => void
  scheduleHlsRestore: (
    hlsVideoRef: RefObject<HTMLVideoElement | null>,
    itemId: string | null | undefined,
  ) => void
  clearHlsRestoreSubscription: () => void
}

export function usePlaybackStatePreservation(): UsePlaybackStatePreservationReturn {
  const preservedStateRef = useRef<PlaybackState | null>(null)
  const preservedStateItemIdRef = useRef<string | null>(null)
  const pendingHlsStateRestoreRef = useRef(false)
  const hlsRestoreVideoRef = useRef<HTMLVideoElement | null>(null)
  const hlsCanPlayListenerRef = useRef<(() => void) | null>(null)
  const hlsRestoreFrameIdRef = useRef<number | null>(null)

  const clear = useCallback(() => {
    preservedStateRef.current = null
    preservedStateItemIdRef.current = null
  }, [])

  const capture = useCallback(
    (
      video: HTMLVideoElement | null | undefined,
      stateItemId: string | null | undefined,
    ) => {
      if (!video || !stateItemId) return

      preservedStateRef.current = capturePlaybackState(video)
      preservedStateItemIdRef.current = stateItemId
    },
    [],
  )

  const getPreserved = useCallback(
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

  const clearHlsRestoreSubscription = useCallback(() => {
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
    pendingHlsStateRestoreRef.current = false
  }, [])

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
    (video: HTMLVideoElement, itemId: string | null | undefined) => {
      if (!pendingHlsStateRestoreRef.current) return

      const savedState = getPreserved(itemId)
      if (!savedState) {
        pendingHlsStateRestoreRef.current = false
        return
      }

      restoreStateAndMaybeResume(video, savedState)
      clear()
      pendingHlsStateRestoreRef.current = false
    },
    [clear, getPreserved, restoreStateAndMaybeResume],
  )

  const scheduleHlsRestore = useCallback(
    (
      hlsVideoRef: RefObject<HTMLVideoElement | null>,
      itemId: string | null | undefined,
    ) => {
      if (!itemId || !getPreserved(itemId)) return

      clearHlsRestoreSubscription()
      pendingHlsStateRestoreRef.current = true

      const attachRestore = () => {
        if (!pendingHlsStateRestoreRef.current) return

        const video = hlsVideoRef.current
        if (!video) {
          hlsRestoreFrameIdRef.current =
            window.requestAnimationFrame(attachRestore)
          return
        }

        hlsRestoreFrameIdRef.current = null

        if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
          restorePendingHlsState(video, itemId)
          return
        }

        const onCanPlay = () => {
          restorePendingHlsState(video, itemId)
          clearHlsRestoreSubscription()
        }

        hlsRestoreVideoRef.current = video
        hlsCanPlayListenerRef.current = onCanPlay
        video.addEventListener('canplay', onCanPlay)
      }

      hlsRestoreFrameIdRef.current = window.requestAnimationFrame(attachRestore)
    },
    [clearHlsRestoreSubscription, getPreserved, restorePendingHlsState],
  )

  return useMemo(
    () => ({
      capture,
      getPreserved,
      clear,
      restoreStateAndMaybeResume,
      scheduleHlsRestore,
      clearHlsRestoreSubscription,
    }),
    [
      capture,
      getPreserved,
      clear,
      restoreStateAndMaybeResume,
      scheduleHlsRestore,
      clearHlsRestoreSubscription,
    ],
  )
}
