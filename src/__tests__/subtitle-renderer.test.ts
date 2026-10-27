// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BaseItemDto } from '@/types/jellyfin'
import type { SubtitleTrackInfo } from '@/services/video/tracks'
import { createJassubRenderer } from '@/services/video/subtitle'
import { useApiStore } from '@/stores/api-store'

const { constructed } = vi.hoisted(() => ({
  constructed: vi.fn<(options: { subUrl: string }) => void>(),
}))

vi.mock('jassub', () => ({
  default: class {
    ready = Promise.resolve()
    constructor(options: { subUrl: string }) {
      constructed(options)
    }
  },
}))

const ITEM: BaseItemDto = { Id: 'item-1' }

function subtitleTrack(format: string): SubtitleTrackInfo {
  return {
    index: 3,
    relativeIndex: 0,
    language: 'eng',
    displayTitle: 'Signs',
    format,
    isExternal: false,
    isDefault: false,
  }
}

/** The pathname of the subtitle URL JASSUB was built with. */
async function subtitlePath(format: string): Promise<string> {
  await createJassubRenderer({
    video: document.createElement('video'),
    track: subtitleTrack(format),
    item: ITEM,
    mediaSourceId: 'extended',
  })
  const options = constructed.mock.lastCall?.[0]
  return new URL(options?.subUrl ?? '').pathname
}

describe('createJassubRenderer', () => {
  beforeEach(() => {
    constructed.mockClear()
    useApiStore.setState({
      serverAddress: 'https://jellyfin.example',
      apiKey: 'api-key',
    })
  })

  it("loads an ASS stream as ASS from the load's media source", async () => {
    expect(await subtitlePath('ASS')).toBe(
      '/Videos/item-1/extended/Subtitles/3/0/Stream.ass',
    )
  })

  it('loads an SSA stream as SSA', async () => {
    expect(await subtitlePath('SSA')).toBe(
      '/Videos/item-1/extended/Subtitles/3/0/Stream.ssa',
    )
  })
})
