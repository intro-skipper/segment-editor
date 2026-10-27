import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { BaseItemDto } from '@/types/jellyfin'
import type { PlaybackStrategy } from '@/services/video/api'
import {
  PlaybackEngine,
  jellyfinPlaybackBackend,
} from '@/services/video/playback-engine'
import { loadHlsJs } from '@/services/video/hls-controller'

interface UseVideoPlayerOptions {
  item: BaseItemDto | null
  jellyfinPlaybackSyncEnabled?: boolean
  onStrategyChange?: (strategy: PlaybackStrategy) => void
  t: (key: string) => string
}

/**
 * Hosts one playback engine that plays `item` on the `<video>` the returned
 * videoRef is attached to; mount that element unconditionally.
 */
export function useVideoPlayer({
  item,
  jellyfinPlaybackSyncEnabled = false,
  onStrategyChange,
  t,
}: UseVideoPlayerOptions) {
  'use memo'

  const videoRef = useRef<HTMLVideoElement>(null)
  const [engine] = useState(
    () => new PlaybackEngine(jellyfinPlaybackBackend, loadHlsJs, videoRef),
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

  return { engine, videoRef }
}
