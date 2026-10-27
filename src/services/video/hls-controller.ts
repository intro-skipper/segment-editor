import { PLAYER_CONFIG } from '@/lib/constants'

const { RECOVERY_TIMEOUT_MS, MEDIA_ERROR_SWAP_WINDOW_MS } = PLAYER_CONFIG

const HLS_CONFIG = {
  testBandwidth: false,
  enableWorker: true,
  lowLatencyMode: false,
  startLevel: -1,
  maxBufferLength: 30,
  maxMaxBufferLength: 60,
  abrEwmaDefaultEstimate: 500000,
} as const

/** The hls.js instance surface playback uses; `Hls` satisfies it for `M = HTMLVideoElement`. */
export interface HlsPlayer<M> {
  attachMedia: (media: M) => void
  loadSource: (url: string) => void
  // eslint-disable-next-line typescript/method-signature-style -- hls.js types on() per event, which only a bivariant method signature accepts
  on(
    event: string,
    listener: (event: string, data: { fatal: boolean; type: string }) => void,
  ): void
  startLoad: () => void
  recoverMediaError: () => void
  swapAudioCodec: () => void
  destroy: () => void
}

/** The hls.js class surface playback uses. */
export interface HlsPlayerClass<H> {
  new (config: typeof HLS_CONFIG & { startPosition: number }): H
  isSupported: () => boolean
  readonly Events: {
    readonly ERROR: string
    readonly MANIFEST_PARSED: string
    readonly FRAG_BUFFERED: string
  }
  readonly ErrorTypes: {
    readonly NETWORK_ERROR: string
    readonly MEDIA_ERROR: string
  }
}

/** What an hls.js session reports: healthy, recovering from a fatal error, or failed until Retry. */
export type HlsHealth =
  | { kind: 'ready' }
  | { kind: 'recovering'; error: 'network_error' | 'media_error' }
  | { kind: 'failed' }

/** A playing HLS source: the hls.js instance (null for native HLS) and its teardown. */
export interface HlsAttachment<H> {
  hls: H | null
  detach: () => void
}

/** Loads hls.js on demand, so direct play never downloads it. */
export const loadHlsJs = async () => (await import('hls.js')).default

/**
 * Plays `url` on `media` through hls.js and recovers from fatal errors in
 * place: network errors restart loading, media errors recover (swapping the
 * audio codec on a repeat within the swap window), anything else waits for
 * Retry. Reports health through `report`.
 */
export function attachHls<
  M extends {
    canPlayType: (type: string) => string
    src: string
    removeAttribute: (name: string) => void
    load: () => void
  },
  H extends HlsPlayer<M>,
>(
  HlsClass: HlsPlayerClass<H>,
  media: M,
  url: string,
  startPosition: number,
  report: (health: HlsHealth) => void,
): HlsAttachment<H> {
  report({ kind: 'ready' })

  if (!HlsClass.isSupported()) {
    // Native HLS (Safari): the element plays the stream itself, so detaching
    // empties it as direct play does; the element outlives the item.
    if (!media.canPlayType('application/vnd.apple.mpegurl')) {
      return { hls: null, detach: () => {} }
    }
    media.src = url
    return {
      hls: null,
      detach: () => {
        media.removeAttribute('src')
        media.load()
      },
    }
  }

  const hls = new HlsClass({ ...HLS_CONFIG, startPosition })
  hls.attachMedia(media)

  let recoveryTimer: ReturnType<typeof setTimeout> | undefined
  /** True while a reported error has not been cleared by a success signal yet. */
  let hasPendingError = false
  let lastMediaRecoveryAt = Number.NEGATIVE_INFINITY

  const recover = (
    error: 'network_error' | 'media_error',
    recoveryFn: () => void,
  ) => {
    hasPendingError = true
    report({ kind: 'recovering', error })
    recoveryFn()

    // FRAG_BUFFERED / MANIFEST_PARSED normally clear the error as soon as
    // playback makes progress again; this timer clears it blindly if neither
    // arrives in time. It is not a success signal, so hasPendingError stays
    // set and a later FRAG_BUFFERED still resets the media swap window.
    clearTimeout(recoveryTimer)
    recoveryTimer = setTimeout(() => {
      report({ kind: 'ready' })
    }, RECOVERY_TIMEOUT_MS)
  }

  const markHealthy = () => {
    lastMediaRecoveryAt = Number.NEGATIVE_INFINITY
    hasPendingError = false
    report({ kind: 'ready' })
    clearTimeout(recoveryTimer)
  }

  hls.on(HlsClass.Events.ERROR, (_event, data) => {
    if (!data.fatal) return

    if (data.type === HlsClass.ErrorTypes.NETWORK_ERROR) {
      recover('network_error', () => hls.startLoad())
    } else if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR) {
      recover('media_error', () => {
        const now = performance.now()
        if (now - lastMediaRecoveryAt < MEDIA_ERROR_SWAP_WINDOW_MS) {
          // Second media error shortly after a recovery attempt: hls.js
          // docs require swapping the audio codec before retrying.
          hls.swapAudioCodec()
        }
        lastMediaRecoveryAt = now
        hls.recoverMediaError()
      })
    } else {
      // Recoverable via Retry, which rebuilds the Hls instance; reporting it
      // as final would strand the user on an overlay with no way out.
      hasPendingError = true
      report({ kind: 'failed' })
    }
  })
  hls.on(HlsClass.Events.MANIFEST_PARSED, markHealthy)
  hls.on(HlsClass.Events.FRAG_BUFFERED, () => {
    if (hasPendingError) markHealthy()
  })

  hls.loadSource(url)

  return {
    hls,
    detach: () => {
      clearTimeout(recoveryTimer)
      // destroy() also removes every listener registered above.
      hls.destroy()
    },
  }
}
