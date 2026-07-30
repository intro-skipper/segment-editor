// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearCapabilityProbeCache,
  probeCanPlayType,
  supportsNativeAudioTrackSwitching,
} from '@/services/video/capabilities'

describe('supportsNativeAudioTrackSwitching', () => {
  // jsdom implements audioTracks; restore whatever the environment provides so
  // the probe is exercised for both the flagged and unflagged browser shapes.
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    'audioTracks',
  )

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(
        HTMLMediaElement.prototype,
        'audioTracks',
        originalDescriptor,
      )
    } else {
      Reflect.deleteProperty(HTMLMediaElement.prototype, 'audioTracks')
    }
  })

  it('is false when the audioTracks property is absent from the prototype', () => {
    Reflect.deleteProperty(HTMLMediaElement.prototype, 'audioTracks')

    expect(supportsNativeAudioTrackSwitching()).toBe(false)
  })

  it('is true when the browser exposes audioTracks on the prototype', () => {
    Object.defineProperty(HTMLMediaElement.prototype, 'audioTracks', {
      configurable: true,
      value: [],
    })

    expect(supportsNativeAudioTrackSwitching()).toBe(true)
  })
})

describe('probeCanPlayType', () => {
  beforeEach(() => {
    clearCapabilityProbeCache()
    vi.restoreAllMocks()
  })

  it('returns the raw canPlayType result and probes only once per MIME type', () => {
    const canPlayType = vi
      .spyOn(HTMLMediaElement.prototype, 'canPlayType')
      .mockReturnValue('maybe')

    expect(probeCanPlayType('video/x-matroska')).toBe('maybe')
    expect(probeCanPlayType('video/x-matroska')).toBe('maybe')
    expect(canPlayType).toHaveBeenCalledTimes(1)
  })

  it('re-probes after the cache is cleared', () => {
    const canPlayType = vi
      .spyOn(HTMLMediaElement.prototype, 'canPlayType')
      .mockReturnValue('')

    expect(probeCanPlayType('video/x-matroska')).toBe('')

    clearCapabilityProbeCache()
    canPlayType.mockReturnValue('maybe')

    expect(probeCanPlayType('video/x-matroska')).toBe('maybe')
    expect(canPlayType).toHaveBeenCalledTimes(2)
  })

  it('returns an empty string when the probe throws', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(
      () => {
        throw new Error('probe failed')
      },
    )

    expect(probeCanPlayType('video/x-matroska')).toBe('')
  })
})
