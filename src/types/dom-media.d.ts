/**
 * HTML media track APIs that TypeScript's DOM lib no longer ships
 * (removed in TS 4.4 because Firefox does not implement them).
 *
 * `audioTracks` is optional on HTMLMediaElement to model reality: Safari
 * exposes it by default, Chromium only behind the `AudioVideoTracks` blink
 * feature, Firefox not at all.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/AudioTrackList
 */
interface AudioTrack {
  enabled: boolean
  readonly id: string
  readonly kind: string
  readonly label: string
  readonly language: string
}

interface AudioTrackList extends EventTarget {
  readonly length: number
  [index: number]: AudioTrack
  getTrackById: (id: string) => AudioTrack | null
}

interface HTMLMediaElement {
  readonly audioTracks?: AudioTrackList
}

/**
 * iOS Safari's video-only fullscreen entry point. No other engine implements
 * it, and iPhone Safari has no element fullscreen API at all, so this is the
 * only way to go fullscreen there. Optional to model that absence.
 *
 * @see https://developer.apple.com/documentation/webkitjs/htmlvideoelement
 */
interface HTMLVideoElement {
  readonly webkitEnterFullscreen?: () => void
}
