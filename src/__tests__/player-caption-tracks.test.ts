// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'

import type { BaseItemDto } from '@/types/jellyfin'
import { buildNativeCaptionTracks } from '@/components/player/caption-tracks'
import { useApiStore } from '@/stores/api-store'

/** An item playing its second version, with two subtitle streams. */
const ITEM: BaseItemDto = {
  Id: 'item-1',
  MediaSources: [
    {
      Id: 'extended',
      MediaStreams: [
        { Type: 'Video', Index: 0 },
        { Type: 'Subtitle', Index: 2, Codec: 'srt', Language: 'eng' },
        { Type: 'Subtitle', Index: 3, Codec: 'ass', DisplayTitle: 'Signs' },
      ],
    },
  ],
}

describe('buildNativeCaptionTracks', () => {
  beforeEach(() => {
    useApiStore.setState({
      serverAddress: 'https://jellyfin.example',
      apiKey: 'api-key',
    })
  })

  it("loads each subtitle stream as VTT from the item's media source", () => {
    const captions = buildNativeCaptionTracks(ITEM)

    expect(
      captions.map(({ index, language, src }) => ({
        index,
        language,
        path: new URL(src).pathname,
      })),
    ).toEqual([
      {
        index: 2,
        language: 'eng',
        path: '/Videos/item-1/extended/Subtitles/2/0/Stream.vtt',
      },
      {
        index: 3,
        language: undefined,
        path: '/Videos/item-1/extended/Subtitles/3/0/Stream.vtt',
      },
    ])
  })

  it('builds none while signed out', () => {
    useApiStore.setState({ apiKey: undefined })

    expect(buildNativeCaptionTracks(ITEM)).toEqual([])
  })
})
