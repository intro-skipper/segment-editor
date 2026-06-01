import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type Hls from 'hls.js'
import type { BaseItemDto } from '@/types/jellyfin'
import type { PlaybackStrategy } from '@/services/video/api'
import type {
  HlsReloadRequest,
  TrackSwitchResult,
} from '@/services/video/track-switching'
import type {
  AudioTrackInfo,
  SubtitleTrackInfo,
  TrackState,
} from '@/services/video/tracks'
import { extractTracks } from '@/services/video/tracks'
import {
  switchAudioTrack,
  switchSubtitleTrack,
} from '@/services/video/track-switching'
import {
  preloadJassubRenderer,
  requiresJassubRenderer,
} from '@/services/video/subtitle'
import { showError } from '@/lib/notifications'
import { languagesMatch } from '@/lib/language-utils'
import { useAppStore } from '@/stores/app-store'

interface UseTrackManagerOptions {
  item: BaseItemDto | null
  strategy: PlaybackStrategy
  videoRef: React.RefObject<HTMLVideoElement | null>
  hlsRef?: React.RefObject<Hls | null>
  t: (key: string) => string
  onReloadHls?: (reload: HlsReloadRequest) => Promise<void>
}

interface UseTrackManagerReturn {
  trackState: TrackState
  selectAudioTrack: (index: number) => Promise<void>
  selectSubtitleTrack: (index: number | null) => Promise<void>
  isLoading: boolean
  error: string | null
}

interface UserTrackSelectionState {
  key: string
  hasAudioSelection: boolean
  audioIndex: number
  hasSubtitleSelection: boolean
  subtitleIndex: number | null
}

function findPreferredAudioIndex(
  audioTracks: Array<AudioTrackInfo>,
  preferredLanguage: string | null,
): number {
  if (preferredLanguage) {
    const preferredTrack = audioTracks.find((track) =>
      languagesMatch(track.language, preferredLanguage),
    )
    if (preferredTrack) return preferredTrack.index
  }

  const defaultTrack = audioTracks.find((track) => track.isDefault)
  if (defaultTrack) return defaultTrack.index

  return audioTracks.length > 0 ? audioTracks[0].index : 0
}

function findPreferredSubtitleIndex(
  subtitleTracks: Array<SubtitleTrackInfo>,
  preferredLanguage: string | null,
  subtitlesEnabled: boolean,
): number | null {
  if (!subtitlesEnabled) return null

  if (preferredLanguage) {
    const preferredTrack = subtitleTracks.find((track) =>
      languagesMatch(track.language, preferredLanguage),
    )
    if (preferredTrack) return preferredTrack.index
  }

  const defaultTrack = subtitleTracks.find((track) => track.isDefault)
  if (defaultTrack) return defaultTrack.index

  return null
}

function getTrackSwitchErrorMessage(
  error: { message: string },
  fallback: string,
): string {
  return error.message ? error.message : fallback
}

function getCaughtTrackSwitchErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof Error) return error.message
  return fallback
}

export function useTrackManager({
  item,
  strategy,
  videoRef,
  hlsRef,
  t,
  onReloadHls,
}: UseTrackManagerOptions): UseTrackManagerReturn {
  'use memo'

  const [userSelection, setUserSelection] = useState<UserTrackSelectionState>({
    key: '',
    hasAudioSelection: false,
    audioIndex: 0,
    hasSubtitleSelection: false,
    subtitleIndex: null,
  })
  const [isTrackOperationPending, setIsTrackOperationPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  if (abortControllerRef.current === null)
    abortControllerRef.current = new AbortController()
  useEffect(() => {
    const controller = new AbortController()
    abortControllerRef.current = controller
    return () => {
      controller.abort()
    }
  }, [])

  const {
    preferredAudioLanguage,
    preferredSubtitleLanguage,
    subtitlesEnabled,
  } = useAppStore(
    useShallow((state: ReturnType<typeof useAppStore.getState>) => ({
      preferredAudioLanguage: state.trackPreferences.preferredAudioLanguage,
      preferredSubtitleLanguage:
        state.trackPreferences.preferredSubtitleLanguage,
      subtitlesEnabled: state.trackPreferences.subtitlesEnabled,
    })),
  )

  const { audioTracks, subtitleTracks } = (() => {
    if (!item) {
      return { audioTracks: [], subtitleTracks: [] }
    }
    return extractTracks(item as Parameters<typeof extractTracks>[0])
  })()

  const itemId = item?.Id ?? undefined

  const trackResetKey = `${itemId ?? ''}|${preferredAudioLanguage ?? ''}|${
    preferredSubtitleLanguage ?? ''
  }|${subtitlesEnabled ? '1' : '0'}|${audioTracks.length}|${
    subtitleTracks.length
  }`

  const preferredAudioIndex = itemId
    ? findPreferredAudioIndex(audioTracks, preferredAudioLanguage)
    : 0

  const preferredSubtitleIndex = itemId
    ? findPreferredSubtitleIndex(
        subtitleTracks,
        preferredSubtitleLanguage,
        subtitlesEnabled,
      )
    : null

  const activeAudioIndex =
    userSelection.key === trackResetKey && userSelection.hasAudioSelection
      ? userSelection.audioIndex
      : preferredAudioIndex

  const activeSubtitleIndex =
    userSelection.key === trackResetKey && userSelection.hasSubtitleSelection
      ? userSelection.subtitleIndex
      : preferredSubtitleIndex

  const trackState: TrackState = {
    audioTracks,
    subtitleTracks,
    activeAudioIndex,
    activeSubtitleIndex,
  }

  const mediaSourceId = item?.MediaSources?.[0]?.Id ?? undefined

  const audioTrackMap = new Map(
    audioTracks.map((track) => [track.index, track]),
  )

  const subtitleTrackMap = new Map(
    subtitleTracks.map((track) => [track.index, track]),
  )

  const createSwitchOptions = (videoElement: HTMLVideoElement) => ({
    strategy,
    videoElement,
    hlsInstance: hlsRef?.current,
    itemId,
    mediaSourceId,
    audioTracks,
    subtitleTracks,
    onReloadHls,
    signal: abortControllerRef.current!.signal,
  })

  const selectAudioTrack = async (index: number): Promise<void> => {
    const video = videoRef.current
    if (!video) {
      setError(t('player.tracks.error.noVideo'))
      return
    }

    const track = audioTrackMap.get(index)
    if (!track) {
      const errorMsg = t('player.tracks.error.trackNotFound')
      setError(errorMsg)
      showError(errorMsg)
      return
    }

    if (index === trackState.activeAudioIndex) {
      return
    }

    setIsTrackOperationPending(true)
    setError(null)

    try {
      const result: TrackSwitchResult = await switchAudioTrack(
        index,
        createSwitchOptions(video),
      )

      if (result.success) {
        setUserSelection((prev) =>
          prev.key === trackResetKey
            ? { ...prev, hasAudioSelection: true, audioIndex: index }
            : {
                key: trackResetKey,
                hasAudioSelection: true,
                audioIndex: index,
                hasSubtitleSelection: false,
                subtitleIndex: null,
              },
        )
      } else if (result.error) {
        const errorMsg = getTrackSwitchErrorMessage(
          result.error,
          t('player.tracks.error.switchFailed'),
        )
        setError(errorMsg)
        showError(errorMsg)
      }
    } catch (err) {
      const errorMsg = getCaughtTrackSwitchErrorMessage(
        err,
        t('player.tracks.error.switchFailed'),
      )
      setError(errorMsg)
      showError(errorMsg)
    }

    setIsTrackOperationPending(false)
  }

  const selectSubtitleTrack = async (index: number | null): Promise<void> => {
    const video = videoRef.current
    if (!video) {
      setError(t('player.tracks.error.noVideo'))
      return
    }

    let selectedTrack: SubtitleTrackInfo | null = null
    if (index !== null) {
      const track = subtitleTrackMap.get(index)
      if (!track) {
        const errorMsg = t('player.tracks.error.trackNotFound')
        setError(errorMsg)
        showError(errorMsg)
        return
      }
      selectedTrack = track
    }

    if (index === trackState.activeSubtitleIndex) {
      return
    }

    if (selectedTrack !== null && requiresJassubRenderer(selectedTrack)) {
      void preloadJassubRenderer().catch(() => {})
    }

    setIsTrackOperationPending(true)
    setError(null)

    try {
      const result: TrackSwitchResult = await switchSubtitleTrack(
        index,
        createSwitchOptions(video),
      )

      if (result.success) {
        setUserSelection((prev) =>
          prev.key === trackResetKey
            ? {
                ...prev,
                hasSubtitleSelection: true,
                subtitleIndex: index,
              }
            : {
                key: trackResetKey,
                hasAudioSelection: false,
                audioIndex: 0,
                hasSubtitleSelection: true,
                subtitleIndex: index,
              },
        )
      } else if (result.error) {
        const errorMsg = getTrackSwitchErrorMessage(
          result.error,
          t('player.tracks.error.switchFailed'),
        )
        setError(errorMsg)
        showError(errorMsg)
      }
    } catch (err) {
      const errorMsg = getCaughtTrackSwitchErrorMessage(
        err,
        t('player.tracks.error.switchFailed'),
      )
      setError(errorMsg)
      showError(errorMsg)
    }

    setIsTrackOperationPending(false)
  }

  return {
    trackState,
    selectAudioTrack,
    selectSubtitleTrack,
    isLoading: isTrackOperationPending,
    error,
  }
}
