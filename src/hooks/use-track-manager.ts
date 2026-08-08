import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type Hls from 'hls.js'
import type { BaseItemDto } from '@/types/jellyfin'
import type { PlaybackStrategy } from '@/services/video/api'
import type {
  HlsReloadRequest,
  TrackSwitchOptions,
  TrackSwitchResult,
} from '@/services/video/track-switching'
import type {
  AudioTrackInfo,
  SubtitleTrackInfo,
  TrackState,
} from '@/services/video/tracks'
import {
  extractTracks,
  findPreferredAudioStreamIndex,
  getContainerDefaultAudioTrack,
} from '@/services/video/tracks'
import {
  switchAudioTrack,
  switchSubtitleTrack,
} from '@/services/video/track-switching'
import { runTrackOperation } from '@/services/video/track-operation'
import { supportsNativeAudioTrackSwitching } from '@/services/video/capabilities'
import {
  isAudioTrackDecodable,
  isAudioTrackDirectPlayable,
} from '@/services/video/compatibility'
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
   * transcode instead of switching in place, aggregated over the switch
   * targets (every audio track except the active one) of a direct-played
   * file: 'all' when every target restarts the stream, 'some' when only
   * certain tracks do, 'none' when every switch is native (or no in-place
   * switch question arises, e.g. HLS or a single audio track).
   */
  audioSwitchTranscodeScope: AudioSwitchTranscodeScope
}

export type AudioSwitchTranscodeScope = 'none' | 'some' | 'all'

interface AudioDecoderProbeState {
  key: string
  decodableIndices: ReadonlySet<number>
}

interface UserTrackSelectionState {
  key: string
  hasAudioSelection: boolean
  audioIndex: number
  hasSubtitleSelection: boolean
  subtitleIndex: number | null
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

const EMPTY_SELECTION: Readonly<Omit<UserTrackSelectionState, 'key'>> = {
  hasAudioSelection: false,
  audioIndex: 0,
  hasSubtitleSelection: false,
  subtitleIndex: null,
}

/**
 * Builds a `setUserSelection` updater that merges `patch` while the selection
 * still belongs to `key` and starts a fresh selection record for `key`
 * otherwise (first selection for an item, or a switch that resolved after the
 * item changed). Returns `prev` unchanged when the patch changes no value, so
 * redundant recordings don't commit a render.
 */
function buildSelectionUpdater(
  key: string,
  patch: Partial<Omit<UserTrackSelectionState, 'key'>>,
): (prev: UserTrackSelectionState) => UserTrackSelectionState {
  return (prev) => {
    if (prev.key !== key) return { key, ...EMPTY_SELECTION, ...patch }
    const changed = (
      Object.keys(patch) as Array<keyof Omit<UserTrackSelectionState, 'key'>>
    ).some((field) => prev[field] !== patch[field])
    return changed ? { ...prev, ...patch } : prev
  }
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
  const [audioDecoderProbe, setAudioDecoderProbe] =
    useState<AudioDecoderProbeState | null>(null)

  // Operations can overlap despite the entry guards: the initial-audio effect
  // re-applies on every loadedmetadata, and its own HLS-reload fallback fires
  // one mid-operation. A bare boolean would clear when the FIRST overlapping
  // operation finishes, unlocking the track menu while another is still in
  // flight, so count acquisitions and only drop the flag at zero. Ref writes
  // happen only inside operations (event/effect contexts), never during
  // render.
  const pendingOperationCountRef = useRef(0)
  const setTrackOperationPending = (pending: boolean): void => {
    pendingOperationCountRef.current = Math.max(
      0,
      pendingOperationCountRef.current + (pending ? 1 : -1),
    )
    setIsTrackOperationPending(pendingOperationCountRef.current > 0)
  }

  const abortControllerRef = useRef<AbortController | null>(null)
  if (abortControllerRef.current === null)
    abortControllerRef.current = new AbortController()

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

  // Identity-stable per item: extractTracks caches its result on the item
  // object, which the JASSUB init effect depends on (see tracks.ts).
  const { audioTracks, subtitleTracks } = extractTracks(item)

  const itemId = item?.Id ?? undefined

  // Keyed by item identity only. Player persists the chosen language after
  // every successful switch, so preference values in this key would let that
  // write invalidate the very selection that caused it (checkmark snapping
  // back to the first track of the same language).
  const trackResetKey = `${itemId ?? ''}|${audioTracks.length}|${subtitleTracks.length}`

  // Rotate the manual-operation controller whenever the item (reset key)
  // changes, not only on unmount: a switch that is still awaiting its decoder
  // probe when the user navigates must not enable the old item's native track
  // or reload the old item's HLS URL after the new item is playing.
  useEffect(() => {
    const controller = new AbortController()
    abortControllerRef.current = controller
    return () => {
      controller.abort()
    }
  }, [trackResetKey])

  // The transcode hint must agree with the switch decision, so it resolves
  // through the same `isAudioTrackDecodable` the switch path calls (results
  // are cached per codec/channel shape). Until a probe resolves for this
  // item, the static allowlist below is the interim answer, the same first
  // gate the switch path applies.
  // Keyed by the tracks' codec/channel content, not just their count, so a
  // metadata refresh that swaps codecs in place re-probes instead of serving
  // the stale decodable set.
  const audioProbeKey = `${trackResetKey}|${audioTracks
    .map((track) => `${track.index}:${track.codec}:${track.channels}`)
    .join(',')}`
  const probeAudioTrackDecoders = useEffectEvent(
    async (): Promise<AudioDecoderProbeState | null> => {
      if (
        strategy !== 'direct' ||
        audioTracks.length <= 1 ||
        !supportsNativeAudioTrackSwitching()
      ) {
        return null
      }

      const key = audioProbeKey
      const results = await Promise.all(
        audioTracks.map(async (track) => ({
          index: track.index,
          decodable: await isAudioTrackDecodable(track),
        })),
      )

      const decodableIndices = new Set<number>()
      for (const result of results) {
        if (result.decodable) decodableIndices.add(result.index)
      }
      return { key, decodableIndices }
    },
  )

  useEffect(() => {
    let stale = false
    probeAudioTrackDecoders()
      .then((probe) => {
        // A newer probe (or unmount) owns the state now; drop this result.
        if (probe !== null && !stale) setAudioDecoderProbe(probe)
      })
      // A rejected probe (mediaCapabilities throwing) leaves the static
      // allowlist as the answer for this item, which is a usable fallback,
      // but log it instead of dropping it into an unhandled rejection.
      .catch((probeError: unknown) => {
        console.error('[TrackManager] Audio decoder probe failed:', probeError)
      })
    return () => {
      stale = true
    }
  }, [strategy, audioProbeKey])

  const preferredAudioIndex = itemId
    ? (findPreferredAudioStreamIndex(audioTracks, preferredAudioLanguage) ?? 0)
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
    signal: AbortSignal,
  ): TrackSwitchOptions => ({
    strategy,
    videoElement,
    hlsInstance: hlsRef?.current,
    itemId,
    mediaSourceId,
    audioTracks,
    subtitleTracks,
    onReloadHls,
    signal,
  })

  // Toast titles stay localized; the raw (English) service message is only
  // ever the secondary description, matching the use-jassub-renderer
  // convention.
  const reportSwitchError = (detail: string | null): void => {
    setError(detail ?? t('player.tracks.error.switchFailed'))
    showError(t('player.tracks.error.switchFailed'), detail ?? undefined)
  }

  const reportCaughtSwitchError = (err: unknown): void => {
    reportSwitchError(err instanceof Error && err.message ? err.message : null)
  }

  const containerDefaultAudioIndex =
    getContainerDefaultAudioTrack(audioTracks)?.index

  // Records what the initial application confirmed, yielding to any audio
  // selection recorded first: a manual switch that resolved while the initial
  // application (or its synchronous default confirmation, whose closure may
  // predate the switch) was still outstanding owns the session, and the
  // initial result must not clobber it.
  const recordInitialAudioSelection = (index: number): void => {
    setUserSelection((prev) =>
      prev.key === trackResetKey && prev.hasAudioSelection
        ? prev
        : buildSelectionUpdater(trackResetKey, {
            hasAudioSelection: true,
            audioIndex: index,
          })(prev),
    )
  }

  // A failed initial application leaves the element playing the container
  // default, so record that as the confirmed selection: the checkmark then
  // reflects what is actually audible, and clicking the preferred track is a
  // real retry instead of dying on the active-index no-op check.
  const confirmFallbackAudioSelection = (): void => {
    if (containerDefaultAudioIndex === undefined) return
    recordInitialAudioSelection(containerDefaultAudioIndex)
  }

  useInitialAudioSelection({
    strategy,
    videoRef,
    activeAudioIndex,
    hasMultipleAudioTracks: audioTracks.length > 1,
    containerDefaultAudioIndex,
    resetKey: itemId,
    createSwitchOptions,
    setPending: setTrackOperationPending,
    onResult: (index, result) => {
      if (result.success) {
        recordInitialAudioSelection(index)
      } else {
        reportSwitchError(result.error.message || null)
        confirmFallbackAudioSelection()
      }
    },
    onCaughtError: (err) => {
      reportCaughtSwitchError(err)
      confirmFallbackAudioSelection()
    },
  })

  // Shared tail of both manual selectors: synchronous admission, the switch
  // through runTrackOperation, and the success/failure bookkeeping. Resolves
  // true only when the switch was applied and recorded.
  const runSelection = async (
    operation: (signal: AbortSignal) => Promise<TrackSwitchResult>,
    successPatch: Partial<Omit<UserTrackSelectionState, 'key'>>,
  ): Promise<boolean> => {
    // Admission must be synchronous: `isTrackOperationPending` is render
    // state, so two selections in the same turn would both read the stale
    // `false`. The counter ref updates before the first operation yields,
    // which rejects the second call instead of running both switches.
    if (pendingOperationCountRef.current > 0) {
      return false
    }

    setError(null)

    const signal = abortControllerRef.current!.signal
    let switched = false
    await runTrackOperation(() => operation(signal), {
      signal,
      setPending: setTrackOperationPending,
      onResult: (result) => {
        if (result.success) {
          switched = true
          setUserSelection(buildSelectionUpdater(trackResetKey, successPatch))
        } else {
          reportSwitchError(result.error.message || null)
        }
      },
      onCaughtError: reportCaughtSwitchError,
    })
    return switched
  }

  const selectAudioTrack = async (index: number): Promise<boolean> => {
    const video = videoRef.current
    if (!video) {
      setError(t('player.tracks.error.noVideo'))
      return false
    }

    if (!audioTrackMap.has(index)) {
      const errorMsg = t('player.tracks.error.trackNotFound')
      setError(errorMsg)
      showError(errorMsg)
      return false
    }

    if (index === trackState.activeAudioIndex) {
      return false
    }

    return runSelection(
      (signal) => switchAudioTrack(index, createSwitchOptions(video, signal)),
      { hasAudioSelection: true, audioIndex: index },
    )
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

    if (selectedTrack !== null && requiresJassubRenderer(selectedTrack)) {
      void preloadJassubRenderer().catch(() => {})
    }

    return runSelection(
      (signal) =>
        switchSubtitleTrack(index, createSwitchOptions(video, signal)),
      { hasSubtitleSelection: true, subtitleIndex: index },
    )
  }

  const nativeSwitchingSupported = supportsNativeAudioTrackSwitching()
  const audioTrackSwitchRequiresTranscode = (
    track: AudioTrackInfo,
  ): boolean => {
    if (!nativeSwitchingSupported) return true
    // A track the browser cannot decode (e.g. DTS) transcodes even when the
    // native switching API is available.
    if (!isAudioTrackDirectPlayable(track.codec)) return true
    return (
      audioDecoderProbe !== null &&
      audioDecoderProbe.key === audioProbeKey &&
      !audioDecoderProbe.decodableIndices.has(track.index)
    )
  }

  // Only tracks the user can actually switch to count: with a DTS track
  // playing, switching to the sole AAC track is native, so no hint is due.
  const audioSwitchTargets =
    strategy === 'direct' && audioTracks.length > 1
      ? audioTracks.filter((track) => track.index !== activeAudioIndex)
      : []
  const transcodingTargetCount = audioSwitchTargets.filter(
    audioTrackSwitchRequiresTranscode,
  ).length

  return {
    trackState,
    selectAudioTrack,
    selectSubtitleTrack,
    isLoading: isTrackOperationPending,
    error,
    audioSwitchTranscodeScope:
      transcodingTargetCount === 0
        ? 'none'
        : transcodingTargetCount === audioSwitchTargets.length
          ? 'all'
          : 'some',
  }
}
