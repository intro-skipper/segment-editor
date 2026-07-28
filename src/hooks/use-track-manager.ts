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
import { runTrackOperation } from '@/services/video/track-operation'
import { supportsNativeAudioTrackSwitching } from '@/services/video/capabilities'
import { useInitialAudioSelection } from '@/hooks/use-initial-audio-selection'
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
  /** Resolves true only when the switch was applied and recorded; callers
   * must not persist preferences for a switch that resolved false. */
  selectAudioTrack: (index: number) => Promise<boolean>
  selectSubtitleTrack: (index: number | null) => Promise<boolean>
  isLoading: boolean
  error: string | null
  /**
   * Whether selecting a different audio track will restart the stream as a
   * transcode instead of switching in place. True only when a direct-played
   * file has more than one audio track and the browser cannot switch natively.
   */
  audioSwitchRequiresTranscode: boolean
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

const EMPTY_SELECTION: Omit<UserTrackSelectionState, 'key'> = {
  hasAudioSelection: false,
  audioIndex: 0,
  hasSubtitleSelection: false,
  subtitleIndex: null,
}

/**
 * Builds a `setUserSelection` updater that merges `patch` while the selection
 * still belongs to `key` and starts a fresh selection record for `key`
 * otherwise (first selection for an item, or a switch that resolved after the
 * item changed).
 */
function buildSelectionUpdater(
  key: string,
  patch: Partial<Omit<UserTrackSelectionState, 'key'>>,
): (prev: UserTrackSelectionState) => UserTrackSelectionState {
  return (prev) =>
    prev.key === key
      ? { ...prev, ...patch }
      : { key, ...EMPTY_SELECTION, ...patch }
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
    ...EMPTY_SELECTION,
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
    return extractTracks(item)
  })()

  const itemId = item?.Id ?? undefined

  // Keyed by item identity only. Player persists the chosen language after
  // every successful switch, so preference values in this key would let that
  // write invalidate the very selection that caused it (checkmark snapping
  // back to the first track of the same language).
  const trackResetKey = `${itemId ?? ''}|${audioTracks.length}|${subtitleTracks.length}`

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

  const createSwitchOptions = (
    videoElement: HTMLVideoElement,
    signal?: AbortSignal,
  ) => ({
    strategy,
    videoElement,
    hlsInstance: hlsRef?.current,
    itemId,
    mediaSourceId,
    audioTracks,
    subtitleTracks,
    onReloadHls,
    signal: signal ?? abortControllerRef.current!.signal,
  })

  // Toast titles stay localized; the raw (English) service message is only
  // ever the secondary description, matching the use-jassub-renderer
  // convention.
  const reportTrackSwitchFailure = (result: TrackSwitchResult): void => {
    if (result.success || !result.error) return

    const detail = result.error.message || null
    setError(detail ?? t('player.tracks.error.switchFailed'))
    showError(t('player.tracks.error.switchFailed'), detail ?? undefined)
  }

  const handleCaughtTrackSwitchError = (err: unknown): void => {
    const detail = err instanceof Error && err.message ? err.message : null
    setError(detail ?? t('player.tracks.error.switchFailed'))
    showError(t('player.tracks.error.switchFailed'), detail ?? undefined)
  }

  // A failed initial application leaves the element playing the container
  // default, so record that as the confirmed selection: the checkmark then
  // reflects what is actually audible, and clicking the preferred track is a
  // real retry instead of dying on the active-index no-op check.
  const confirmFallbackAudioSelection = (): void => {
    if (audioTracks.length === 0) return
    const fallbackIndex =
      audioTracks.find((track) => track.isDefault)?.index ??
      audioTracks[0].index
    setUserSelection(
      buildSelectionUpdater(trackResetKey, {
        hasAudioSelection: true,
        audioIndex: fallbackIndex,
      }),
    )
  }

  useInitialAudioSelection({
    strategy,
    videoRef,
    activeAudioIndex,
    audioTracks,
    resetKey: itemId,
    createSwitchOptions,
    setPending: setIsTrackOperationPending,
    onResult: (index, result) => {
      if (result.success) {
        setUserSelection(
          buildSelectionUpdater(trackResetKey, {
            hasAudioSelection: true,
            audioIndex: index,
          }),
        )
      } else {
        reportTrackSwitchFailure(result)
        confirmFallbackAudioSelection()
      }
    },
    onCaughtError: (err) => {
      handleCaughtTrackSwitchError(err)
      confirmFallbackAudioSelection()
    },
  })

  const selectAudioTrack = async (index: number): Promise<boolean> => {
    const video = videoRef.current
    if (!video) {
      setError(t('player.tracks.error.noVideo'))
      return false
    }

    const track = audioTrackMap.get(index)
    if (!track) {
      const errorMsg = t('player.tracks.error.trackNotFound')
      setError(errorMsg)
      showError(errorMsg)
      return false
    }

    if (index === trackState.activeAudioIndex) {
      return false
    }

    if (isTrackOperationPending) {
      return false
    }

    setError(null)

    const signal = abortControllerRef.current!.signal
    let switched = false
    await runTrackOperation(
      () => switchAudioTrack(index, createSwitchOptions(video, signal)),
      {
        signal,
        setPending: setIsTrackOperationPending,
        onResult: (result) => {
          if (result.success) {
            switched = true
            setUserSelection(
              buildSelectionUpdater(trackResetKey, {
                hasAudioSelection: true,
                audioIndex: index,
              }),
            )
          } else {
            reportTrackSwitchFailure(result)
          }
        },
        onCaughtError: handleCaughtTrackSwitchError,
      },
    )
    return switched
  }

  const selectSubtitleTrack = async (
    index: number | null,
  ): Promise<boolean> => {
    const video = videoRef.current
    if (!video) {
      setError(t('player.tracks.error.noVideo'))
      return false
    }

    let selectedTrack: SubtitleTrackInfo | null = null
    if (index !== null) {
      const track = subtitleTrackMap.get(index)
      if (!track) {
        const errorMsg = t('player.tracks.error.trackNotFound')
        setError(errorMsg)
        showError(errorMsg)
        return false
      }
      selectedTrack = track
    }

    if (index === trackState.activeSubtitleIndex) {
      return false
    }

    if (isTrackOperationPending) {
      return false
    }

    if (selectedTrack !== null && requiresJassubRenderer(selectedTrack)) {
      void preloadJassubRenderer().catch(() => {})
    }

    setError(null)

    const signal = abortControllerRef.current!.signal
    let switched = false
    await runTrackOperation(
      () => switchSubtitleTrack(index, createSwitchOptions(video, signal)),
      {
        signal,
        setPending: setIsTrackOperationPending,
        onResult: (result) => {
          if (result.success) {
            switched = true
            setUserSelection(
              buildSelectionUpdater(trackResetKey, {
                hasSubtitleSelection: true,
                subtitleIndex: index,
              }),
            )
          } else {
            reportTrackSwitchFailure(result)
          }
        },
        onCaughtError: handleCaughtTrackSwitchError,
      },
    )
    return switched
  }

  return {
    trackState,
    selectAudioTrack,
    selectSubtitleTrack,
    isLoading: isTrackOperationPending,
    error,
    audioSwitchRequiresTranscode:
      strategy === 'direct' &&
      audioTracks.length > 1 &&
      !supportsNativeAudioTrackSwitching(),
  }
}
