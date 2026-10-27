import { useEffect, useLayoutEffect, useState } from 'react'
import type { JellyfinSessionDescriptor } from '@/services/video/status-reporter'
import {
  PlaybackStatusReporter,
  jellyfinStatusBackend,
} from '@/services/video/status-reporter'

export type { JellyfinSessionDescriptor }

interface UseJellyfinSessionOptions {
  session: JellyfinSessionDescriptor | null
  getActiveVideoElement: () => HTMLVideoElement | null
}

export interface UseJellyfinSessionReturn {
  /** Start reporting. Call after playback config is applied. */
  startPlaybackStatus: (positionTicksOverride?: number) => Promise<void>
  /** Stop reporting (async, normal path). */
  stopPlaybackStatus: () => Promise<void>
  /** Stop reporting + encoding via keepalive (pagehide path). */
  stopAllKeepalive: () => void
  /** Stop a previous HLS encoding session by explicit ID. */
  stopPreviousEncoding: (previousPlaySessionId: string) => Promise<void>
}

/** Hosts one PlaybackStatusReporter for the player's lifetime. */
export function useJellyfinSession({
  session,
  getActiveVideoElement,
}: UseJellyfinSessionOptions): UseJellyfinSessionReturn {
  const [reporter] = useState(
    () =>
      new PlaybackStatusReporter(
        jellyfinStatusBackend,
        getActiveVideoElement,
        session,
      ),
  )

  useLayoutEffect(() => {
    reporter.update(session, getActiveVideoElement)
  }, [reporter, session, getActiveVideoElement])

  const playSessionId = session?.playSessionId
  const strategy = session?.strategy
  useEffect(
    () =>
      reporter.trackEncoding(
        playSessionId && strategy ? { playSessionId, strategy } : null,
      ),
    [reporter, playSessionId, strategy],
  )

  const itemId = session?.itemId
  const mediaSourceId = session?.mediaSourceId
  const syncEnabled = session?.syncEnabled
  useEffect(() => {
    if (!syncEnabled) return
    const stopObserving = reporter.observe()
    return () => {
      stopObserving()
    }
  }, [reporter, itemId, mediaSourceId, playSessionId, strategy, syncEnabled])

  return {
    startPlaybackStatus: reporter.start,
    stopPlaybackStatus: reporter.stop,
    stopAllKeepalive: reporter.stopAllKeepalive,
    stopPreviousEncoding: reporter.stopPreviousEncoding,
  }
}
