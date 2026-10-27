import { createContext, use, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

import type { Segment } from '@/types/segment'
import type { HlsPlayer } from '@/services/video/hls-controller'
import type {
  PlaybackEngine,
  PlaybackSnapshot,
} from '@/services/video/playback-engine'
import type { PlaybackTrackState } from '@/services/video/playback-tracks'
import type { PlayheadTimeline } from '@/services/video/playhead'
import type { HlsTrackController } from '@/services/video/track-switching'

/** The engine the player components read and command, whichever hls.js it runs. */
export type PlayerEngine = PlaybackEngine<
  HTMLVideoElement,
  HlsPlayer<HTMLVideoElement> & HlsTrackController
>

const PlaybackContext = createContext<PlayerEngine | null>(null)

/** Hands `engine` to the player components below it. */
export function PlaybackProvider({
  engine,
  children,
}: {
  engine: PlayerEngine
  children: ReactNode
}) {
  return <PlaybackContext value={engine}>{children}</PlaybackContext>
}

/** The engine of the nearest PlaybackProvider, for its commands. */
export function usePlaybackEngine(): PlayerEngine {
  const engine = use(PlaybackContext)
  if (!engine) {
    throw new Error('usePlaybackEngine must be used inside a PlaybackProvider')
  }
  return engine
}

// The selector hooks re-render only when the selected value changes. A
// selector must return a primitive or a value the snapshot holds, never a
// new object.

/** Selects from the engine's playback snapshot: status, strategy, play state, volume, speed. */
export function usePlayback<T>(selector: (snapshot: PlaybackSnapshot) => T): T {
  const engine = usePlaybackEngine()
  return useSyncExternalStore(engine.subscribe, () =>
    selector(engine.getSnapshot()),
  )
}

/** Selects from the playhead's published position, duration and buffered end. */
export function usePlayheadTimeline<T>(
  selector: (timeline: PlayheadTimeline) => T,
): T {
  const { playhead } = usePlaybackEngine()
  return useSyncExternalStore(playhead.subscribe, () =>
    selector(playhead.getTimeline()),
  )
}

/** The segment the skip button offers, or null. */
export function useSkipOffer(): Segment | null {
  const { playhead } = usePlaybackEngine()
  return useSyncExternalStore(playhead.subscribe, playhead.getSkipOffer)
}

/** Selects from the audio and subtitle track state. */
export function usePlaybackTracks<T>(
  selector: (state: PlaybackTrackState) => T,
): T {
  const { tracks } = usePlaybackEngine()
  return useSyncExternalStore(tracks.subscribe, () =>
    selector(tracks.getState()),
  )
}

/** The user subtitle offset in seconds; set it through `engine.subtitles`. */
export function useSubtitleOffset(): number {
  const { subtitles } = usePlaybackEngine()
  return useSyncExternalStore(subtitles.subscribe, subtitles.getOffset)
}
