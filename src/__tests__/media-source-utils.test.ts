import { describe, expect, it } from 'vitest'

import type { BaseItemDto } from '@/types/jellyfin'
import {
  findMediaSource,
  getMediaSourceLabel,
  getSelectableMediaSources,
  itemForMediaSource,
} from '@/lib/media-source-utils'

function createItem(): BaseItemDto {
  return {
    Id: 'item-id',
    RunTimeTicks: 100,
    MediaSources: [
      {
        Id: 'default-source',
        Name: '1080p',
        Path: '/media/movie-1080p.mkv',
        RunTimeTicks: 100,
        MediaStreams: [{ Type: 'Video', Width: 1920 }],
      },
      {
        Id: 'director-source',
        Name: "Director's Cut",
        Path: '/media/movie-directors-cut.mkv',
        RunTimeTicks: 200,
        MediaStreams: [{ Type: 'Video', Width: 3840 }],
      },
    ],
    Trickplay: {
      'default-source': {
        '320': { Width: 320, Height: 180 },
      },
      'director-source': {
        '640': { Width: 640, Height: 360 },
      },
    },
  }
}

describe('media-source-utils', () => {
  it('keeps only uniquely identifiable media sources', () => {
    const sources = getSelectableMediaSources({
      MediaSources: [
        { Id: 'source-1' },
        { Id: 'SOURCE-1' },
        { Id: null },
        { Name: 'missing id' },
        { Id: 'source-2' },
      ],
    })

    expect(sources.map((source) => source.Id)).toEqual(['source-1', 'source-2'])
  })

  it('uses the source name, then the file name, then a stable fallback label', () => {
    expect(
      getMediaSourceLabel({ Name: 'Extended', Path: '/a/file.mkv' }, 0),
    ).toBe('Extended')
    expect(
      getMediaSourceLabel({ Name: null, Path: 'C:\\media\\file.mkv' }, 1),
    ).toBe('file.mkv')
    expect(getMediaSourceLabel({ Name: null, Path: null }, 2)).toBe('Version 3')
  })

  it('falls back to Jellyfin’s default source for an unknown selection', () => {
    const item = createItem()

    expect(findMediaSource(item, 'does-not-exist')?.Id).toBe('default-source')
    expect(findMediaSource(item, 'DIRECTOR-SOURCE')?.Id).toBe('director-source')
  })

  it('narrows playback metadata to the selected source while preserving item identity', () => {
    const item = createItem()
    const selected = itemForMediaSource(item, 'director-source')

    expect(selected).not.toBe(item)
    expect(selected.Id).toBe(item.Id)
    expect(selected.MediaSources).toHaveLength(1)
    expect(selected.MediaSources?.[0]?.Id).toBe('director-source')
    expect(selected.MediaStreams).toEqual(
      selected.MediaSources?.[0]?.MediaStreams,
    )
    expect(selected.RunTimeTicks).toBe(200)
    expect(selected.Trickplay).toEqual({
      'director-source': {
        '640': { Width: 640, Height: 360 },
      },
    })
    expect(item.MediaSources).toHaveLength(2)
    expect(Object.keys(item.Trickplay ?? {})).toEqual([
      'default-source',
      'director-source',
    ])
  })
})
