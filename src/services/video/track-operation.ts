import type { TrackSwitchResult } from '@/services/video/track-switching'

/**
 * Runs a track switch, holding the pending flag for exactly its duration and
 * dropping result/error callbacks once `signal` aborts, so a stale operation
 * cannot report errors or commit state after unmount or a newer selection.
 *
 * Shared by the manual selection path (`useTrackManager`) and the initial
 * direct-play application (`useInitialAudioSelection`) so both hold the same
 * contract: pending flag set for the operation's duration, abort silences
 * callbacks, results route to `onResult`, throws route to `onCaughtError`.
 *
 * The `finally` lives here, at module scope, on purpose: React Compiler 1.x
 * cannot lower a `try` with a finalizer ("Handle TryStatement with a finalizer
 * ('finally') clause"), so a `finally` inside `useTrackManager` would silently
 * drop the hook from compilation despite its `'use memo'` directive. This
 * helper is neither a component nor a hook, so the compiler skips it and the
 * flag still clears on success, failure, and rejection alike.
 */
export async function runTrackOperation(
  operation: () => Promise<TrackSwitchResult>,
  handlers: {
    signal: AbortSignal
    setPending: (pending: boolean) => void
    onResult: (result: TrackSwitchResult) => void
    onCaughtError: (error: unknown) => void
  },
): Promise<void> {
  handlers.setPending(true)
  try {
    const result = await operation()
    if (handlers.signal.aborted) return
    handlers.onResult(result)
  } catch (err) {
    if (handlers.signal.aborted) return
    handlers.onCaughtError(err)
  } finally {
    handlers.setPending(false)
  }
}
