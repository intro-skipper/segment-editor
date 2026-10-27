import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type Hls from 'hls.js'
import type { BaseItemDto } from '@/types/jellyfin'
import type { PlaybackStrategy } from '@/services/video/api'
import type { HlsReloadRequest } from '@/services/video/track-switching'
import type { VideoPlayerError } from '@/services/video/playback-error'
import {
  PlaybackEngine,
  jellyfinPlaybackBackend,
} from '@/services/video/playback-engine'
import { loadHlsJs } from '@/services/video/hls-controller'
import type { Playhead } from '@/services/video/playhead'

interface UseVideoPlayerOptions {
  item: BaseItemDto | null
  /**
   * Called once per playback initialization (item or media source change) to
   * resolve the audio stream index the new session should start on, so a
   * changed preference applies only to the next initialization.
   */
  getInitialAudioStreamIndex?: () => number | undefined
  /**
   * Returns the audio stream index the session is currently playing (the
   * initial selection or a later native switch). The direct-play error
   * fallback reads it when it happens.
   */
  getCurrentAudioStreamIndex?: () => number | undefined
  jellyfinPlaybackSyncEnabled?: boolean
  onStrategyChange?: (strategy: PlaybackStrategy) => void
  t: (key: string) => string
}

interface UseVideoPlayerReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>
  hlsRef: React.RefObject<Hls | null>
  playhead: Playhead
  strategy: PlaybackStrategy
  isLoading: boolean
  error: VideoPlayerError | null
  isRecovering: boolean
  retry: () => void
  videoUrl: string
  reloadHlsWithUrl: (reload: HlsReloadRequest) => Promise<void>
}

/** Plays `item` on the `<video>` the returned videoRef is attached to; mount that element unconditionally. */
export function useVideoPlayer({
  item,
  getInitialAudioStreamIndex,
  getCurrentAudioStreamIndex,
  jellyfinPlaybackSyncEnabled = false,
  onStrategyChange,
  t,
}: UseVideoPlayerOptions): UseVideoPlayerReturn {
  'use memo'

  const videoRef = useRef<HTMLVideoElement>(null)
  const [engine] = useState(
    () => new PlaybackEngine(jellyfinPlaybackBackend, loadHlsJs, videoRef),
  )
  const {
    itemId: loadedItemId,
    strategy,
    videoUrl,
    status,
  } = useSyncExternalStore(engine.subscribe, engine.getSnapshot)

  useLayoutEffect(() => {
    engine.setHost({
      getInitialAudioStreamIndex,
      getCurrentAudioStreamIndex,
      onStrategyChange,
      t,
    })
  }, [
    engine,
    getInitialAudioStreamIndex,
    getCurrentAudioStreamIndex,
    onStrategyChange,
    t,
  ])

  useEffect(() => engine.connect(), [engine])

  useEffect(() => {
    engine.load(item)
  }, [engine, item])

  useEffect(() => {
    engine.setSyncEnabled(jellyfinPlaybackSyncEnabled)
  }, [engine, jellyfinPlaybackSyncEnabled])

  const itemId = item?.Id ?? null
  // Until this item's status arrives, a previous item's error or recovery
  // must not show.
  const isLoading =
    !!itemId && (loadedItemId !== itemId || status.kind === 'resolving')
  const hasLoadedSession = !!itemId && !isLoading

  return {
    videoRef,
    hlsRef: engine.hlsRef,
    playhead: engine.playhead,
    strategy,
    isLoading,
    error:
      hasLoadedSession &&
      (status.kind === 'failed' || status.kind === 'recovering')
        ? status.error
        : null,
    isRecovering: hasLoadedSession && status.kind === 'recovering',
    retry: engine.retry,
    videoUrl: itemId ? videoUrl : '',
    reloadHlsWithUrl: engine.reloadHlsWithUrl,
  }
}
