import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { BaseItemDto } from '@/types/jellyfin'
import type { PlaybackStrategy } from '@/services/video/api'
import type { VideoPlayerError } from '@/services/video/playback-error'
import {
  PlaybackEngine,
  jellyfinPlaybackBackend,
} from '@/services/video/playback-engine'
import { loadHlsJs } from '@/services/video/hls-controller'
import type { Playhead } from '@/services/video/playhead'
import type { PlaybackTrackState } from '@/services/video/playback-tracks'

interface UseVideoPlayerOptions {
  item: BaseItemDto | null
  jellyfinPlaybackSyncEnabled?: boolean
  onStrategyChange?: (strategy: PlaybackStrategy) => void
  t: (key: string) => string
}

interface UseVideoPlayerReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>
  playhead: Playhead
  strategy: PlaybackStrategy
  isLoading: boolean
  error: VideoPlayerError | null
  isRecovering: boolean
  retry: () => void
  videoUrl: string
  tracks: PlaybackTrackState
  /** Resolve true only for an applied switch; a failure has shown its toast. */
  selectAudio: (index: number) => Promise<boolean>
  selectSubtitle: (index: number | null) => Promise<boolean>
  toggleSubtitles: () => void
}

/** Plays `item` on the `<video>` the returned videoRef is attached to; mount that element unconditionally. */
export function useVideoPlayer({
  item,
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
  const tracks = useSyncExternalStore(
    engine.tracks.subscribe,
    engine.tracks.getState,
  )

  useLayoutEffect(() => {
    engine.setHost({ onStrategyChange, t })
  }, [engine, onStrategyChange, t])

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
    tracks,
    selectAudio: engine.tracks.selectAudio,
    selectSubtitle: engine.tracks.selectSubtitle,
    toggleSubtitles: engine.tracks.toggleSubtitles,
  }
}
