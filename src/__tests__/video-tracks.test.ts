import { describe, expect, it } from 'vitest'

import {
  extractTracks,
  findPreferredAudioStreamIndex,
} from '@/services/video/tracks'

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
    const result = extractTracks({
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
    } as unknown as Parameters<typeof extractTracks>[0])

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
