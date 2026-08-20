import { describe, expect, it } from 'vitest'

import {
  extractTracks,
  findPreferredAudioStreamIndex,
} from '@/services/video/tracks'
import type { BaseItemDto } from '@/types/jellyfin'

/**
 * One media stream as Jellyfin actually sends it. The generated client type
 * declares Index, IsDefault and IsExternal as plain optionals, but the server
 * emits explicit nulls for them.
 */
interface WireMediaStream {
  Type?: string | null
  Index?: number | null
  Language?: string | null
  DisplayTitle?: string | null
  Codec?: string | null
  Channels?: number | null
  IsDefault?: boolean | null
  IsExternal?: boolean | null
  DeliveryUrl?: string | null
}

/** The slice of an item carrying those streams. */
interface WireItem {
  MediaSources?: Array<{ MediaStreams?: Array<WireMediaStream> | null }> | null
}

describe('extractTracks null-tolerant Jellyfin input', () => {
  it('returns empty tracks for missing, null, or empty media sources', () => {
    expect(extractTracks(undefined)).toEqual({
      audioTracks: [],
      subtitleTracks: [],
    })
    expect(extractTracks(null)).toEqual({
      audioTracks: [],
      subtitleTracks: [],
    })
    expect(extractTracks({ MediaSources: null })).toEqual({
      audioTracks: [],
      subtitleTracks: [],
    })
    expect(extractTracks({ MediaSources: [] })).toEqual({
      audioTracks: [],
      subtitleTracks: [],
    })
  })

  it('returns empty tracks when the primary media source has null streams', () => {
    expect(extractTracks({ MediaSources: [{ MediaStreams: null }] })).toEqual({
      audioTracks: [],
      subtitleTracks: [],
    })
  })

  it('normalizes nullable stream fields and DeliveryUrl null', () => {
    const item: WireItem = {
      MediaSources: [
        {
          MediaStreams: [
            {
              Type: 'Audio',
              Index: null,
              Language: null,
              DisplayTitle: null,
              Codec: null,
              Channels: null,
              IsDefault: null,
            },
            {
              Type: 'Subtitle',
              Index: null,
              Language: null,
              DisplayTitle: null,
              Codec: null,
              IsExternal: null,
              IsDefault: null,
              DeliveryUrl: null,
            },
          ],
        },
      ],
    }

    // SAFETY: the server sends explicit nulls for Index, IsDefault and
    // IsExternal, which the generated client type declares as plain optionals;
    // normalising those nulls is exactly what this test covers.
    const result = extractTracks(item as BaseItemDto)

    expect(result.audioTracks).toEqual([
      {
        index: 0,
        relativeIndex: 0,
        language: null,
        displayTitle: 'Unknown - Unknown Stereo',
        codec: 'Unknown',
        channels: 2,
        isDefault: false,
      },
    ])
    expect(result.subtitleTracks).toEqual([
      {
        index: 0,
        relativeIndex: 0,
        language: null,
        displayTitle: 'Unknown - Unknown',
        format: 'Unknown',
        isExternal: false,
        isDefault: false,
        deliveryUrl: undefined,
      },
    ])
  })
})

describe('findPreferredAudioStreamIndex', () => {
  const makeTrack = (
    index: number,
    language: string | null,
    isDefault = false,
  ) => ({
    index,
    relativeIndex: index - 1,
    language,
    displayTitle: `Track ${index}`,
    codec: 'aac',
    channels: 2,
    isDefault,
  })

  it('prefers a language match over the default flag', () => {
    const tracks = [makeTrack(1, 'eng', true), makeTrack(2, 'jpn')]
    expect(findPreferredAudioStreamIndex(tracks, 'jpn')).toBe(2)
  })

  it('falls back to the default-flagged track, then the first track', () => {
    expect(
      findPreferredAudioStreamIndex(
        [makeTrack(1, 'eng'), makeTrack(2, 'jpn', true)],
        'deu',
      ),
    ).toBe(2)
    expect(
      findPreferredAudioStreamIndex(
        [makeTrack(1, 'eng'), makeTrack(2, 'jpn')],
        null,
      ),
    ).toBe(1)
  })

  it('returns undefined when there are no audio tracks', () => {
    expect(findPreferredAudioStreamIndex([], 'eng')).toBeUndefined()
  })
})
