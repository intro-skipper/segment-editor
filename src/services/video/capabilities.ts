/**
 * Browser media capability probes.
 *
 * All probes are lazy: nothing touches the DOM at module load, so the module
 * stays importable under jsdom/SSR and every probe can be mocked in tests.
 *
 * @module services/video/capabilities
 */

/**
 * Cache for `canPlayType` probe results, keyed by MIME type.
 * The answer cannot change within a page session, so one probe per type is enough.
 */
const canPlayTypeCache: Map<string, string> = new Map()

/**
 * Clears the cached `canPlayType` probe results.
 * Useful for testing or when browser capabilities may have changed.
 */
export function clearCapabilityProbeCache(): void {
  canPlayTypeCache.clear()
}

/**
 * Detects if the browser is Safari (for native HLS handling).
 */
export function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /Safari/.test(ua) && !/Chrome/.test(ua) && !/Chromium/.test(ua)
}

/**
 * Detects if the browser is Firefox.
 */
export function isFirefox(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Firefox\//.test(navigator.userAgent)
}

/**
 * Probes `HTMLMediaElement.canPlayType` for a MIME type.
 *
 * Returns an empty string when no DOM is available (jsdom/SSR) or when the
 * browser does not recognize the type, mirroring the native API contract
 * (`''` | `'maybe'` | `'probably'`).
 *
 * @param mimeType - The MIME type to probe (e.g. "video/x-matroska")
 * @returns The raw `canPlayType` result, cached per MIME type
 */
export function probeCanPlayType(mimeType: string): string {
  const cached = canPlayTypeCache.get(mimeType)
  if (cached !== undefined) return cached

  let result = ''
  if (typeof document !== 'undefined') {
    try {
      result = document.createElement('video').canPlayType(mimeType)
    } catch {
      result = ''
    }
  }

  canPlayTypeCache.set(mimeType, result)
  return result
}

/**
 * Whether the browser exposes the HTML `audioTracks` API, which allows
 * switching the active audio track of a direct-played file without
 * interrupting playback.
 *
 * Safari ships this natively. Chromium keeps it behind the `AudioVideoTracks`
 * blink runtime feature (`--enable-blink-features=AudioVideoTracks` or the
 * experimental web platform features flag), where the property is completely
 * absent when disabled. Firefox does not implement it.
 *
 * @returns true when native audio track switching is available
 */
export function supportsNativeAudioTrackSwitching(): boolean {
  return (
    typeof HTMLMediaElement !== 'undefined' &&
    'audioTracks' in HTMLMediaElement.prototype
  )
}
