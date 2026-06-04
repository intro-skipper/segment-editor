import { describe, expect, it } from 'vitest'

import { extractTracks } from '@/services/video/tracks'

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
